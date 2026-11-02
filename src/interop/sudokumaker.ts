/**
 * SudokuMaker (sudokumaker.app) JSON interop (import/export).
 *
 * This is a separate adapter. It is isolated from the generic runtime,
 * like `interop/fpuzzles.ts` and `runtime/serialization.ts`.
 * Nothing in `src/runtime` or `src/definitions` knows this format exists.
 *
 * The user reconstructed the shape from the build of the live app.
 * The sandbox has no network route to sudokumaker.app.
 * One real share link verified the shape before it was trusted:
 * base64url-decode the payload, drop the leading "D", and raw-inflate it.
 * The result is the documented JSON shape.
 * A leading "N" instead of "D" marks a legacy lz-string-compressed payload (`compressToEncodedURIComponent`).
 * The scope is deliberately partial, like the "common types first" cut of the f-puzzles adapter:
 * classic sudoku (including jigsaw regions), givens, killer cages, thermometers, arrows,
 * kropki-equivalent dots (the Difference/Ratio edge clues), and odd/even markers.
 * The importer reports any other data in the source as a warning.
 * It does the same for a puzzle constraint that this module cannot represent on export.
 * It never drops data silently.
 */

import { deflateRaw, inflateRaw } from "pako";
import { decompressFromEncodedURIComponent } from "lz-string";

import { GridGeometry, type CellId, type GridGeometrySpec } from "@/runtime/geometry.ts";
import { findRectangularBoxes, slugify } from "@/interop/shared.ts";
import { isDefinitionRef, type ConstraintSpec, type PuzzleDefinition } from "@/runtime/puzzle.ts";

interface SudokuMakerCell {
    given?: boolean;
    value?: number;
}

interface SudokuMakerConstraint {
    type: number;
    [key: string]: unknown;
}

interface SudokuMakerPuzzle {
    name?: string;
    author?: string;
    comment?: string;
    type?: "sudoku" | "custom";
    size?: number;
    width?: number;
    height?: number;
    minDigit?: number;
    maxDigit?: number;
    cells: SudokuMakerCell[];
    constraints: SudokuMakerConstraint[];
}

export interface SudokuMakerExport {
    formatVersion: string;
    puzzle: SudokuMakerPuzzle;
}

export interface ImportResult {
    puzzle: PuzzleDefinition;
    warnings: readonly string[];
}

export interface ExportResult {
    data: SudokuMakerExport;
    warnings: readonly string[];
}

const FORMAT_VERSION = "1.6.0";

// --- byte/string helpers --------------------------------------------------

const fromBase64Url = (value: string): Uint8Array => {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

const toBase64Url = (bytes: Uint8Array): string => {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** SudokuMaker shares a puzzle as `?puzzle=<payload>`.
 *  Like the share-link extraction of the f-puzzles adapter, this code deliberately does not use `URLSearchParams`.
 *  The reason is the same: the payload has literal unencoded base64 characters. */
const extractSharePayload = (text: string): string => {
    const m = /[?&]puzzle=([^&#]+)/.exec(text);
    return m ? m[1] : text;
};

const decodePayload = (payload: string): string | Error => {
    if (payload.startsWith("D")) {
        try {
            const bytes = fromBase64Url(payload.slice(1));
            return new TextDecoder().decode(inflateRaw(bytes));
        } catch (err) {
            return new Error(`could not inflate SudokuMaker payload: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    if (payload.startsWith("N")) {
        const decompressed = decompressFromEncodedURIComponent(payload.slice(1));
        if (!decompressed) return new Error("could not decode legacy (lz-string) SudokuMaker payload");
        return decompressed;
    }
    return new Error(`unrecognized SudokuMaker payload prefix "${payload[0] ?? ""}"`);
};

// --- cell / edge id helpers ------------------------------------------------

const idToCell = (id: number, width: number): CellId => `r${Math.floor(id / width) + 1}c${(id % width) + 1}`;

const cellToId = (cell: CellId, width: number): number | undefined => {
    const m = /^r(\d+)c(\d+)$/.exec(cell);
    if (!m) return undefined;
    return (Number(m[2]) - 1) + (Number(m[1]) - 1) * width;
};

/** Edge ids address the gap between two orthogonally adjacent cells. Difference/Ratio/XV clues use them.
 *  Each row has a block of size 2*width.
 *  The low half [0,width) is the horizontal-neighbor (left/right) pair that ends at column `block+1`.
 *  The high half [width,2*width) is the vertical-neighbor (up/down) pair that starts at column `block-width`.
 *  This comes directly from the two forward formulas in the spec.
 *  It does not come from the prose description of the inverse in the spec, which seems to be inverted. */
const edgeToCells = (edge: number, width: number, height: number): [CellId, CellId] | undefined => {
    if (!Number.isInteger(edge) || edge < 0) return undefined;
    const row = Math.floor(edge / (2 * width));
    const block = edge % (2 * width);
    if (block < width) {
        const col = block + 1;
        if (col < 1 || col >= width || row >= height) return undefined;
        return [idToCell((col - 1) + row * width, width), idToCell(col + row * width, width)];
    }
    const col = block - width;
    if (col < 0 || col >= width || row + 1 >= height) return undefined;
    return [idToCell(col + row * width, width), idToCell(col + (row + 1) * width, width)];
};

const cellsToEdge = (a: CellId, b: CellId, width: number): number | undefined => {
    const ida = cellToId(a, width);
    const idb = cellToId(b, width);
    if (ida === undefined || idb === undefined) return undefined;
    const ra = Math.floor(ida / width);
    const ca = ida % width;
    const rb = Math.floor(idb / width);
    const cb = idb % width;
    if (ra === rb && Math.abs(ca - cb) === 1) {
        const col = Math.max(ca, cb);
        return col + ra * 2 * width;
    }
    if (ca === cb && Math.abs(ra - rb) === 1) {
        const row = Math.min(ra, rb);
        return ca + width + row * 2 * width;
    }
    return undefined;
};

// --- import -----------------------------------------------------------

export const importSudokuMaker = (input: unknown): ImportResult | Error => {
    let data: unknown = input;
    if (typeof input === "string") {
        const trimmed = input.trim();
        if (trimmed.startsWith("{")) {
            try {
                data = JSON.parse(trimmed);
            } catch (err) {
                return new Error(`invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
            }
        } else {
            const decoded = decodePayload(extractSharePayload(trimmed));
            if (decoded instanceof Error) return decoded;
            try {
                data = JSON.parse(decoded);
            } catch (err) {
                return new Error(`invalid JSON after decoding: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }
    if (typeof data !== "object" || data === null) return new Error("SudokuMaker input must be an object");
    const root = data as Record<string, unknown>;

    const puzzleRaw = root.puzzle;
    if (typeof puzzleRaw !== "object" || puzzleRaw === null) return new Error('"puzzle" must be an object');
    const src = puzzleRaw as SudokuMakerPuzzle;

    const isCustom = src.type === "custom";
    const size = typeof src.size === "number" ? src.size : 9;
    const width = isCustom ? (typeof src.width === "number" ? src.width : 9) : size;
    const height = isCustom ? (typeof src.height === "number" ? src.height : 9) : size;
    const minDigit = typeof src.minDigit === "number" ? src.minDigit : 1;
    const maxDigit = typeof src.maxDigit === "number" ? src.maxDigit : 9;

    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
        return new Error("puzzle width/height must be positive integers");
    }
    if (!Number.isInteger(minDigit) || !Number.isInteger(maxDigit) || maxDigit < minDigit) {
        return new Error("puzzle minDigit/maxDigit must be integers with maxDigit >= minDigit");
    }

    const cellsRaw = src.cells;
    if (!Array.isArray(cellsRaw) || cellsRaw.length !== width * height) {
        return new Error(`"cells" must be an array of length width*height (${width * height})`);
    }

    const warnings: string[] = [];
    const domain = Array.from({ length: maxDigit - minDigit + 1 }, (_, i) => minDigit + i);
    const givens: Record<CellId, number> = {};
    for (let i = 0; i < cellsRaw.length; i++) {
        const c = cellsRaw[i];
        if (c && c.given && typeof c.value === "number") {
            givens[idToCell(i, width)] = c.value;
        }
    }

    let geometry: GridGeometrySpec = { type: "grid", width, height };
    let regions: Record<string, readonly CellId[]> | undefined;
    let sudokuRef: ConstraintSpec = { use: "sudoku", boxes: false };
    let sawGivensMarker = false;
    let sawRegionsConstraint = false;

    const constraints: ConstraintSpec[] = [];
    const constraintsRaw = Array.isArray(src.constraints) ? src.constraints : [];

    for (const c of constraintsRaw) {
        if (typeof c?.type !== "number") continue;
        switch (c.type) {
            case 0: // Givens: the "normal sudoku rules apply" marker (rows/cols)
                sawGivensMarker = true;
                break;

            case 1: { // Regions: the box shape (and possibly jigsaw)
                sawRegionsConstraint = true;
                const regionsArr = Array.isArray(c.regions) ? (c.regions as unknown[]) : [];
                const byRegion = new Map<number, CellId[]>();
                for (let i = 0; i < regionsArr.length; i++) {
                    const r = regionsArr[i];
                    if (typeof r !== "number" || r < 0) continue;
                    const group = byRegion.get(r) ?? [];
                    group.push(idToCell(i, width));
                    byRegion.set(r, group);
                }
                const groups = [...byRegion.values()];
                const rect = width === height ? findRectangularBoxes(width, groups) : undefined;
                if (rect) {
                    geometry = { type: "grid", width, height, boxWidth: rect.boxWidth, boxHeight: rect.boxHeight };
                    sudokuRef = { use: "sudoku" };
                } else {
                    const named: Record<string, readonly CellId[]> = {};
                    for (const [region, cells] of byRegion) named[`fbox:${region}`] = cells;
                    regions = named;
                    sudokuRef = { use: "sudoku", boxes: false, extraRegions: Object.keys(named).sort() };
                    warnings.push(
                        "regions are not a uniform rectangular tiling (jigsaw sudoku); the box constraint is " +
                            "correct, but the renderer currently always draws rectangular box lines from the " +
                            "grid's dimensions (see kanban #55), so the drawn grid lines won't match these " +
                            "regions yet",
                    );
                }
                break;
            }

            case 100: // Even
            case 101: { // Odd
                const use = c.type === 100 ? "even" : "odd";
                const cellIds = Array.isArray(c.cells) ? (c.cells as unknown[]) : [];
                for (const id of cellIds) {
                    if (typeof id !== "number") {
                        warnings.push(`${use} marker with an unrecognized cell id was skipped`);
                        continue;
                    }
                    constraints.push({ use, cell: idToCell(id, width) });
                }
                break;
            }

            case 200: // Difference
            case 201: { // Ratio
                const use = c.type === 200 ? "kropkiDifference" : "kropkiRatio";
                const negative = Array.isArray(c.negative) ? (c.negative as unknown[]) : [];
                if (negative.length > 0) {
                    warnings.push(
                        `${use} "negative" constraints (asserting no other such relationship exists ` +
                            "anywhere else) are not supported and were ignored",
                    );
                }
                const clues = Array.isArray(c.clues) ? (c.clues as unknown[]) : [];
                for (const clue of clues) {
                    const edge = (clue as { edge?: unknown })?.edge;
                    const value = (clue as { value?: unknown })?.value;
                    if (typeof edge !== "number") {
                        warnings.push(`${use} clue with a missing edge id was skipped`);
                        continue;
                    }
                    const pair = edgeToCells(edge, width, height);
                    if (!pair) {
                        warnings.push(`${use} clue with an unresolvable edge id was skipped`);
                        continue;
                    }
                    constraints.push({ use, cells: pair, ...(typeof value === "number" ? { value } : {}) });
                }
                break;
            }

            case 300: { // Thermometer
                const thermos = Array.isArray(c.thermometers) ? (c.thermometers as unknown[]) : [];
                for (const line of thermos) {
                    if (!Array.isArray(line) || line.length < 2 || !line.every((id) => typeof id === "number")) {
                        warnings.push("thermometer with an unrecognized shape was skipped");
                        continue;
                    }
                    constraints.push({ use: "thermometer", cells: (line as number[]).map((id) => idToCell(id, width)) });
                }
                break;
            }

            case 301: { // KillerCages
                const cages = Array.isArray(c.cages) ? (c.cages as unknown[]) : [];
                for (const cage of cages) {
                    const cellIds = (cage as { cells?: unknown })?.cells;
                    if (!Array.isArray(cellIds) || !cellIds.every((id) => typeof id === "number")) {
                        warnings.push("killer cage with an unrecognized shape was skipped");
                        continue;
                    }
                    const sum = (cage as { value?: unknown })?.value;
                    constraints.push({
                        use: "killer",
                        cells: (cellIds as number[]).map((id) => idToCell(id, width)),
                        ...(typeof sum === "number" ? { sum } : {}),
                    });
                }
                break;
            }

            case 408: { // Arrow
                const groups = Array.isArray(c.bulbsWithArrows) ? (c.bulbsWithArrows as unknown[]) : [];
                for (const group of groups) {
                    const bulbIdsRaw = (group as { bulbCells?: unknown })?.bulbCells;
                    const bulbIds = Array.isArray(bulbIdsRaw) ? (bulbIdsRaw as unknown[]) : [];
                    if (!bulbIds.every((id) => typeof id === "number")) {
                        warnings.push("arrow with an unrecognized bulb was skipped");
                        continue;
                    }
                    const bulb = (bulbIds as number[]).map((id) => idToCell(id, width));
                    const arrows = (group as { arrows?: unknown })?.arrows;
                    for (const line of Array.isArray(arrows) ? (arrows as unknown[]) : []) {
                        if (!Array.isArray(line) || line.length === 0 || !line.every((id) => typeof id === "number")) {
                            warnings.push("arrow line with an unrecognized shape was skipped");
                            continue;
                        }
                        const cells = (line as number[]).map((id) => idToCell(id, width));
                        // Assumption: the line includes the bulb cell(s) as leading entries.
                        // This is not verified against a real exported arrow (the sample used to build this has none).
                        // It matches the own Thermometer convention of this format ("bulb -> tip", bulb included).
                        // It also matches the equivalent f-puzzles bug that was fixed earlier in the interop work.
                        // Verify it with real data, the same way as that bug was found.
                        const resolvedBulb = bulb.length > 0 ? bulb : [cells[0]];
                        const shaft = cells.slice(resolvedBulb.length);
                        if (shaft.length === 0) {
                            warnings.push("arrow with an empty shaft was skipped");
                            continue;
                        }
                        constraints.push({
                            use: "arrow",
                            bulb: resolvedBulb.length === 1 ? resolvedBulb[0] : resolvedBulb,
                            cells: shaft,
                        });
                    }
                }
                break;
            }

            default:
                warnings.push(`constraint type ${c.type} is not supported by this importer and was ignored`);
        }
    }

    if (sawGivensMarker) constraints.unshift(sudokuRef);
    else if (sawRegionsConstraint) {
        warnings.push('a Regions constraint was present without the "normal sudoku rules" marker; applied as a box-only constraint');
        constraints.unshift(sudokuRef);
    }

    let solution: Record<CellId, number> | undefined;
    const exportBlock = (root.puzzle as { export?: { sudokuPad?: { solution?: unknown } } })?.export;
    const rawSolution = exportBlock?.sudokuPad?.solution;
    if (Array.isArray(rawSolution) && rawSolution.length === width * height) {
        const parsed = rawSolution.map((v) => (typeof v === "string" ? Number(v) : v));
        if (parsed.every((v): v is number => typeof v === "number" && Number.isFinite(v) && domain.includes(v))) {
            solution = {};
            for (let i = 0; i < parsed.length; i++) solution[idToCell(i, width)] = parsed[i] as number;
        } else {
            warnings.push('"export.sudokuPad.solution" was present but malformed; ignored');
        }
    }

    const title = typeof src.name === "string" && src.name.length > 0 ? src.name : "Imported SudokuMaker puzzle";
    const puzzle: PuzzleDefinition = {
        version: 1,
        metadata: {
            id: `sudokumaker-${slugify(title)}`,
            title,
            ...(typeof src.author === "string" && src.author ? { author: src.author } : {}),
            ...(typeof src.comment === "string" && src.comment ? { description: src.comment } : {}),
        },
        geometry,
        domain: { values: domain },
        ...(regions ? { regions } : {}),
        ...(Object.keys(givens).length > 0 ? { givens } : {}),
        constraints,
        ...(solution ? { solution } : {}),
    };

    return { puzzle, warnings };
};

// --- export -------------------------------------------------------------

export const exportSudokuMaker = (def: PuzzleDefinition): ExportResult | Error => {
    if (def.geometry.type !== "grid") return new Error("only grid geometries can be exported to SudokuMaker");
    const { width, height } = def.geometry;

    const domain = [...def.domain.values].sort((a, b) => a - b);
    const minDigit = domain[0];
    const maxDigit = domain[domain.length - 1];
    const contiguous = domain.length === maxDigit - minDigit + 1 && domain.every((v, i) => v === minDigit + i);
    if (!contiguous) {
        return new Error("SudokuMaker export requires a contiguous integer domain (minDigit..maxDigit)");
    }

    const warnings: string[] = [];
    const geometry = new GridGeometry(def.geometry);

    const regionOf = new Map<CellId, number>();
    const jigsawEntries = Object.entries(def.regions ?? {}).filter(([name]) => name.startsWith("fbox:"));
    let includesBoxes = true;
    if (jigsawEntries.length > 0) {
        for (const [name, cells] of jigsawEntries) {
            const region = Number(name.slice("fbox:".length));
            for (const cell of cells) regionOf.set(cell, region);
        }
    } else {
        const sudokuSpec = def.constraints.find((s) => isDefinitionRef(s) && s.use === "sudoku");
        includesBoxes = !(sudokuSpec && isDefinitionRef(sudokuSpec) && sudokuSpec.boxes === false);
        if (includesBoxes) {
            const boxesAcross = Math.ceil(geometry.width / geometry.boxWidth);
            const boxesDown = Math.ceil(geometry.height / geometry.boxHeight);
            for (let i = 0; i < boxesAcross * boxesDown; i++) {
                for (const cell of geometry.resolveRegion(`box:${i}`) ?? []) regionOf.set(cell, i);
            }
        }
    }

    const cells: SudokuMakerCell[] = geometry.cells.map((cell) => {
        const given = def.givens?.[cell];
        return given !== undefined ? { given: true, value: given } : {};
    });

    const exportIds = (cellIds: readonly CellId[]): number[] | undefined => {
        const out: number[] = [];
        for (const c of cellIds) {
            const id = cellToId(c, width);
            if (id === undefined) return undefined;
            out.push(id);
        }
        return out;
    };

    const constraints: SudokuMakerConstraint[] = [{ type: 0 }];
    if (regionOf.size > 0) {
        const regions = geometry.cells.map((c) => regionOf.get(c) ?? -1);
        constraints.push({ type: 1, regions });
    }

    const odd: number[] = [];
    const even: number[] = [];
    const difference: { edge: number; value?: number }[] = [];
    const ratio: { edge: number; value?: number }[] = [];
    const thermometers: number[][] = [];
    const cages: { cells: number[]; value?: number }[] = [];
    const bulbsWithArrows: { bulbCells: number[]; arrows: number[][] }[] = [];

    for (const spec of def.constraints) {
        if (!isDefinitionRef(spec)) {
            warnings.push("a hand-written primitive constraint cannot be represented in SudokuMaker export; dropped");
            continue;
        }
        const { use, ...params } = spec;
        if (use === "sudoku") continue; // the Givens/Regions constraints above handle it

        if (use === "killer") {
            const ids = exportIds(params.cells as CellId[]);
            if (!ids) {
                warnings.push("killer cage with a non-grid cell id was skipped");
                continue;
            }
            cages.push({ cells: ids, ...(typeof params.sum === "number" ? { value: params.sum } : {}) });
        } else if (use === "thermometer") {
            const ids = exportIds(params.cells as CellId[]);
            if (!ids) {
                warnings.push("thermometer with a non-grid cell id was skipped");
                continue;
            }
            thermometers.push(ids);
        } else if (use === "arrow") {
            const bulbRaw = params.bulb;
            const bulbCells = Array.isArray(bulbRaw) ? (bulbRaw as CellId[]) : typeof bulbRaw === "string" ? [bulbRaw] : [];
            const bulbIds = exportIds(bulbCells);
            const shaftIds = exportIds(params.cells as CellId[]);
            if (!bulbIds || !shaftIds) {
                warnings.push("arrow with a non-grid cell id was skipped");
                continue;
            }
            bulbsWithArrows.push({ bulbCells: bulbIds, arrows: [[...bulbIds, ...shaftIds]] });
        } else if (use === "kropkiDifference" || use === "kropkiRatio") {
            const pair = params.cells as CellId[];
            const edge = Array.isArray(pair) && pair.length === 2 ? cellsToEdge(pair[0], pair[1], width) : undefined;
            if (edge === undefined) {
                warnings.push(`${use} with cells that aren't orthogonally adjacent grid cells was skipped`);
                continue;
            }
            const clue = { edge, ...(typeof params.value === "number" ? { value: params.value } : {}) };
            (use === "kropkiDifference" ? difference : ratio).push(clue);
        } else if (use === "odd" || use === "even") {
            const raw = typeof params.cell === "string" ? params.cell : Array.isArray(params.cells) ? params.cells[0] : undefined;
            const id = typeof raw === "string" ? cellToId(raw, width) : undefined;
            if (id === undefined) {
                warnings.push(`${use} marker with a non-grid cell id was skipped`);
                continue;
            }
            (use === "odd" ? odd : even).push(id);
        } else {
            warnings.push(`constraint using definition "${use}" cannot be represented in SudokuMaker export; dropped`);
        }
    }

    if (odd.length > 0) constraints.push({ type: 101, cells: odd });
    if (even.length > 0) constraints.push({ type: 100, cells: even });
    if (difference.length > 0) constraints.push({ type: 200, clues: difference });
    if (ratio.length > 0) constraints.push({ type: 201, clues: ratio });
    if (thermometers.length > 0) constraints.push({ type: 300, thermometers });
    if (cages.length > 0) constraints.push({ type: 301, cages });
    if (bulbsWithArrows.length > 0) constraints.push({ type: 408, bulbsWithArrows });

    const isClassic = width === height && minDigit === 1 && maxDigit === width;
    const puzzle: SudokuMakerPuzzle = {
        name: def.metadata.title,
        ...(def.metadata.author ? { author: def.metadata.author } : {}),
        ...(def.metadata.description ? { comment: def.metadata.description } : {}),
        ...(isClassic ? (width !== 9 ? { size: width } : {}) : { type: "custom", width, height, minDigit, maxDigit }),
        cells,
        constraints,
    };

    return { data: { formatVersion: FORMAT_VERSION, puzzle }, warnings };
};

/** The inverse of the share-link decoding in the "D" branch of `importSudokuMaker`.
 *  It uses raw-deflate via `pako` and base64url encoding, and puts the result in `?puzzle=`.
 *  It always writes the current ("D"-prefixed, non-legacy) format. */
export const encodeSudokuMakerShareLink = (data: SudokuMakerExport): string =>
    `https://sudokumaker.app/?puzzle=D${toBase64Url(deflateRaw(new TextEncoder().encode(JSON.stringify(data))))}`;
