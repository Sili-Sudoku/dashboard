/**
 * f-puzzles JSON interop (import/export).
 *
 * f-puzzles (and the SudokuPad/Logic Mines/Crack The Cuber ecosystem built on
 * its JSON export) is the de facto standard interchange format for
 * hand-authored variant sudokus. This module is a standalone adapter,
 * isolated from the generic runtime exactly like `runtime/serialization.ts`
 * — nothing in `src/runtime` or `src/definitions` knows this format exists.
 *
 * The shape below is reconstructed from community documentation of the
 * public f-puzzles export (this sandbox has no network route to
 * f-puzzles.com to fetch the live spec) and may not match every
 * exporter/version byte-for-byte — verify against a real exported file
 * before relying on an import. Scope is deliberately partial, per the v2
 * brief's "common types first": classic sudoku (including jigsaw regions),
 * givens, killer cages, thermometers, arrows, kropki dots (difference/
 * ratio), and odd/even markers. Anything else present in the source is
 * reported as a warning, never silently dropped — same for any supported
 * clue whose cells don't resolve.
 */

import { compressToBase64, decompressFromBase64 } from "lz-string";

import { GridGeometry, type CellId, type GridGeometrySpec } from "@/runtime/geometry.ts";
import { isDefinitionRef, type ConstraintSpec, type PuzzleDefinition } from "@/runtime/puzzle.ts";

export interface FPuzzlesCell {
    value?: number;
    given?: boolean;
    region?: number;
}

export interface FPuzzlesCellsClue {
    cells: string[];
    value?: string | number;
}

export interface FPuzzlesLinesClue {
    lines: string[][];
}

export interface FPuzzlesArrowClue {
    cells?: string[];
    lines: string[][];
}

export type FPuzzlesCellClue = string | { cell: string };

export interface FPuzzlesExport {
    size: number;
    grid: FPuzzlesCell[][];
    title?: string;
    author?: string;
    ruleset?: string;
    solution?: string[];
    killercage?: FPuzzlesCellsClue[];
    thermometer?: FPuzzlesLinesClue[];
    arrow?: FPuzzlesArrowClue[];
    difference?: FPuzzlesCellsClue[];
    ratio?: FPuzzlesCellsClue[];
    odd?: FPuzzlesCellClue[];
    even?: FPuzzlesCellClue[];
}

export interface ImportResult {
    puzzle: PuzzleDefinition;
    warnings: readonly string[];
}

export interface ExportResult {
    data: FPuzzlesExport;
    warnings: readonly string[];
}

const KNOWN_TOP_LEVEL_KEYS = new Set([
    "size",
    "grid",
    "title",
    "author",
    "ruleset",
    "solution",
    "killercage",
    "thermometer",
    "arrow",
    "difference",
    "ratio",
    "odd",
    "even",
]);

const toProjectCell = (cell: string): CellId | undefined => {
    const m = /^[Rr](\d+)[Cc](\d+)$/.exec(cell);
    if (!m) return undefined;
    return `r${m[1]}c${m[2]}`;
};

const toFPuzzlesCell = (cell: CellId): string | undefined => {
    const m = /^r(\d+)c(\d+)$/.exec(cell);
    if (!m) return undefined;
    return `R${m[1]}C${m[2]}`;
};

const mapCells = (ids: readonly string[]): CellId[] | undefined => {
    const out: CellId[] = [];
    for (const raw of ids) {
        const c = toProjectCell(raw);
        if (!c) return undefined;
        out.push(c);
    }
    return out;
};

/**
 * f-puzzles.com shares a puzzle as a URL whose "load" query parameter is the
 * JSON, lz-string-compressed and base64-encoded (`?load=<payload>`) — not raw
 * JSON. Confirmed against a real share link; also confirmed the payload is
 * NOT percent-encoded (it contains literal "+"/"/" base64 characters), so
 * this deliberately avoids `URLSearchParams`/`decodeURIComponent`: those
 * apply form-urlencoded decoding, which turns a literal "+" into a space and
 * silently corrupts the payload.
 */
const extractShareLinkPayload = (text: string): string => {
    const m = /[?&]load=([^&#]+)/.exec(text);
    return m ? m[1] : text;
};

const slugify = (s: string): string => {
    const slug = s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || "puzzle";
};

const divisorsOf = (n: number): number[] => {
    const out: number[] = [];
    for (let d = 1; d <= n; d++) if (n % d === 0) out.push(d);
    return out;
};

const regionSignature = (groups: readonly (readonly CellId[])[]): string =>
    groups
        .map((g) => [...g].sort().join(","))
        .sort()
        .join("|");

/** Find the (boxWidth, boxHeight) whose standard box:N partition matches the
 *  given per-cell groups exactly, if any — so a non-sqrt-shaped but still
 *  rectangular tiling (e.g. 6x6 with 3x2 boxes) renders its box lines
 *  correctly instead of being treated as jigsaw. */
const findRectangularBoxes = (
    size: number,
    actualGroups: readonly (readonly CellId[])[],
): { boxWidth: number; boxHeight: number } | undefined => {
    const want = regionSignature(actualGroups);
    for (const bw of divisorsOf(size)) {
        for (const bh of divisorsOf(size)) {
            const geo = new GridGeometry({ type: "grid", width: size, height: size, boxWidth: bw, boxHeight: bh });
            const boxCount = Math.ceil(size / bw) * Math.ceil(size / bh);
            const groups: CellId[][] = [];
            for (let i = 0; i < boxCount; i++) {
                const g = geo.resolveRegion(`box:${i}`);
                if (g) groups.push([...g]);
            }
            if (regionSignature(groups) === want) return { boxWidth: bw, boxHeight: bh };
        }
    }
    return undefined;
};

// --- import -------------------------------------------------------------

export const importFPuzzles = (input: unknown): ImportResult | Error => {
    let data: unknown = input;
    if (typeof input === "string") {
        const trimmed = input.trim();
        let jsonText = trimmed;
        if (!trimmed.startsWith("{")) {
            // Not raw JSON: treat it as a share link (full URL, or just the "load"
            // payload copied on its own) and try to decompress it first.
            const decompressed = decompressFromBase64(extractShareLinkPayload(trimmed));
            if (!decompressed) {
                return new Error(
                    "input is neither valid f-puzzles JSON nor a decodable f-puzzles share link",
                );
            }
            jsonText = decompressed;
        }
        try {
            data = JSON.parse(jsonText);
        } catch (err) {
            return new Error(`invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    if (typeof data !== "object" || data === null) return new Error("f-puzzles input must be an object");
    const src = data as Record<string, unknown>;

    const size = src.size;
    if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) {
        return new Error('"size" must be a positive integer (only square grids are supported)');
    }

    const grid = src.grid;
    if (
        !Array.isArray(grid) ||
        grid.length !== size ||
        grid.some((row) => !Array.isArray(row) || row.length !== size)
    ) {
        return new Error(`"grid" must be a ${size}x${size} array matching "size"`);
    }

    const warnings: string[] = [];
    const domain = Array.from({ length: size }, (_, i) => i + 1);
    const givens: Record<CellId, number> = {};

    let allHaveRegion = true;
    const byRegion = new Map<number, CellId[]>();

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const fc = (grid as FPuzzlesCell[][])[r][c];
            const cell: CellId = `r${r + 1}c${c + 1}`;
            if (fc && typeof fc.value === "number" && fc.value > 0 && fc.given) {
                givens[cell] = fc.value;
            }
            if (fc && typeof fc.region === "number" && Number.isInteger(fc.region)) {
                const group = byRegion.get(fc.region) ?? [];
                group.push(cell);
                byRegion.set(fc.region, group);
            } else {
                allHaveRegion = false;
            }
        }
    }

    let geometry: GridGeometrySpec = { type: "grid", width: size, height: size };
    let regions: Record<string, readonly CellId[]> | undefined;
    let sudokuRef: ConstraintSpec;

    if (!allHaveRegion) {
        // f-puzzles omits per-cell "region" entirely for puzzles that just use the
        // default box shape (confirmed: a real exported classic-sudoku-shaped puzzle
        // had no region data at all, yet still has standard boxes) — so when the grid
        // size is a perfect square, default to the geometry's own √-based box size
        // rather than disabling boxes outright. For a non-square size (e.g. 6), that
        // default degenerates to one box covering the whole grid (see geometry.ts'
        // defaultBox), which would make `allDifferent` impossible to satisfy — so
        // boxes stay disabled there, same as before.
        const root = Math.sqrt(size);
        if (Number.isInteger(root)) {
            warnings.push(
                "not every cell declares a region; falling back to the grid's default " +
                    `${root}x${root} box size (this is right for a standard-boxed puzzle, ` +
                    "but wrong if the source actually uses custom/no boxes without saying so)",
            );
            sudokuRef = { use: "sudoku" };
        } else {
            warnings.push("not every cell declares a region; box/region all-different constraint omitted");
            sudokuRef = { use: "sudoku", boxes: false };
        }
    } else {
        const actualGroups = [...byRegion.values()];
        const rect = findRectangularBoxes(size, actualGroups);
        if (rect) {
            geometry = { type: "grid", width: size, height: size, boxWidth: rect.boxWidth, boxHeight: rect.boxHeight };
            sudokuRef = { use: "sudoku" };
        } else {
            const named: Record<string, readonly CellId[]> = {};
            for (const [region, cells] of byRegion) named[`fbox:${region}`] = cells;
            regions = named;
            warnings.push(
                "regions are not a uniform rectangular tiling (jigsaw sudoku); the box constraint is correct, " +
                    "but the renderer currently always draws rectangular box lines from the grid's dimensions " +
                    "(see kanban #55), so the drawn grid lines won't match these regions yet",
            );
            sudokuRef = { use: "sudoku", boxes: false, extraRegions: Object.keys(named).sort() };
        }
    }

    const constraints: ConstraintSpec[] = [sudokuRef];

    for (const clue of (src.killercage as FPuzzlesCellsClue[] | undefined) ?? []) {
        const cells = mapCells(clue.cells);
        if (!cells) {
            warnings.push("cage with an unrecognized cell id was skipped");
            continue;
        }
        const sum = typeof clue.value === "string" ? Number(clue.value) : clue.value;
        constraints.push({ use: "killer", cells, ...(typeof sum === "number" && Number.isFinite(sum) ? { sum } : {}) });
    }

    for (const clue of (src.thermometer as FPuzzlesLinesClue[] | undefined) ?? []) {
        for (const line of clue.lines ?? []) {
            const cells = mapCells(line);
            if (!cells || cells.length < 2) {
                warnings.push("thermometer line with an unrecognized cell id or too few cells was skipped");
                continue;
            }
            constraints.push({ use: "thermometer", cells });
        }
    }

    for (const clue of (src.arrow as FPuzzlesArrowClue[] | undefined) ?? []) {
        const bulbCells = clue.cells ? mapCells(clue.cells) : undefined;
        if (clue.cells && !bulbCells) {
            warnings.push("arrow with an unrecognized bulb cell was skipped");
            continue;
        }
        for (const line of clue.lines ?? []) {
            const cells = mapCells(line);
            if (!cells || cells.length === 0) {
                warnings.push("arrow line with an unrecognized cell id was skipped");
                continue;
            }
            // The line's leading cell(s) are always the bulb, whether or not "cells"
            // redundantly repeats them (confirmed against a real f-puzzles export:
            // a single-cell-bulb arrow has lines: [[bulb, ...shaft]] and
            // cells: [bulb] at once) — so the shaft is always the line with however
            // many bulb cells sliced off the front, never the full line.
            const bulb = bulbCells && bulbCells.length > 0 ? bulbCells : [cells[0]];
            const shaft = cells.slice(bulb.length);
            if (shaft.length === 0) {
                warnings.push("arrow with an empty shaft was skipped");
                continue;
            }
            constraints.push({ use: "arrow", bulb: bulb.length === 1 ? bulb[0] : bulb, cells: shaft });
        }
    }

    const importDot = (use: "kropkiDifference" | "kropkiRatio", clues: readonly FPuzzlesCellsClue[] | undefined) => {
        for (const clue of clues ?? []) {
            const cells = mapCells(clue.cells);
            if (!cells || cells.length !== 2) {
                warnings.push(`${use} dot with unexpected cells was skipped`);
                continue;
            }
            const value = typeof clue.value === "string" ? Number(clue.value) : clue.value;
            constraints.push({ use, cells, ...(typeof value === "number" && Number.isFinite(value) && value > 0 ? { value } : {}) });
        }
    };
    importDot("kropkiDifference", src.difference as FPuzzlesCellsClue[] | undefined);
    importDot("kropkiRatio", src.ratio as FPuzzlesCellsClue[] | undefined);

    const importParity = (use: "odd" | "even", clues: readonly FPuzzlesCellClue[] | undefined) => {
        for (const clue of clues ?? []) {
            const raw = typeof clue === "string" ? clue : clue.cell;
            const cell = toProjectCell(raw);
            if (!cell) {
                warnings.push(`${use} marker with an unrecognized cell id was skipped`);
                continue;
            }
            constraints.push({ use, cell });
        }
    };
    importParity("odd", src.odd as FPuzzlesCellClue[] | undefined);
    importParity("even", src.even as FPuzzlesCellClue[] | undefined);

    for (const key of Object.keys(src)) {
        if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
            warnings.push(`clue type "${key}" is not supported by this importer and was ignored`);
        }
    }

    let solution: Record<CellId, number> | undefined;
    const rawSolution = src.solution;
    if (Array.isArray(rawSolution) && rawSolution.length === size * size) {
        const parsed = rawSolution.map((v) => (typeof v === "string" ? Number(v) : v));
        if (parsed.every((v): v is number => typeof v === "number" && Number.isFinite(v) && domain.includes(v))) {
            solution = {};
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    solution[`r${r + 1}c${c + 1}`] = parsed[r * size + c] as number;
                }
            }
        } else {
            warnings.push('"solution" was present but malformed; ignored');
        }
    }

    const title = typeof src.title === "string" && src.title.length > 0 ? src.title : "Imported f-puzzles";
    const puzzle: PuzzleDefinition = {
        version: 1,
        metadata: {
            id: `fpuzzles-${slugify(title)}`,
            title,
            ...(typeof src.author === "string" && src.author ? { author: src.author } : {}),
            ...(typeof src.ruleset === "string" && src.ruleset ? { description: src.ruleset } : {}),
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

export const exportFPuzzles = (def: PuzzleDefinition): ExportResult | Error => {
    if (def.geometry.type !== "grid") return new Error("only grid geometries can be exported to f-puzzles");
    const { width, height } = def.geometry;
    if (width !== height) return new Error("only square grids can be exported to f-puzzles");
    const size = width;

    const warnings: string[] = [];
    const geometry = new GridGeometry(def.geometry);

    const regionOf = new Map<CellId, number>();
    const jigsawEntries = Object.entries(def.regions ?? {}).filter(([name]) => name.startsWith("fbox:"));
    if (jigsawEntries.length > 0) {
        for (const [name, cells] of jigsawEntries) {
            const region = Number(name.slice("fbox:".length));
            for (const cell of cells) regionOf.set(cell, region);
        }
    } else {
        const boxesAcross = Math.ceil(geometry.width / geometry.boxWidth);
        const boxesDown = Math.ceil(geometry.height / geometry.boxHeight);
        for (let i = 0; i < boxesAcross * boxesDown; i++) {
            for (const cell of geometry.resolveRegion(`box:${i}`) ?? []) regionOf.set(cell, i);
        }
    }

    const grid: FPuzzlesCell[][] = [];
    for (let r = 0; r < size; r++) {
        const row: FPuzzlesCell[] = [];
        for (let c = 0; c < size; c++) {
            const cell: CellId = `r${r + 1}c${c + 1}`;
            const given = def.givens?.[cell];
            const fc: FPuzzlesCell = {};
            if (given !== undefined) {
                fc.value = given;
                fc.given = true;
            }
            const region = regionOf.get(cell);
            if (region !== undefined) fc.region = region;
            row.push(fc);
        }
        grid.push(row);
    }

    const cage: FPuzzlesCellsClue[] = [];
    const thermometer: FPuzzlesLinesClue[] = [];
    const arrow: FPuzzlesArrowClue[] = [];
    const difference: FPuzzlesCellsClue[] = [];
    const ratio: FPuzzlesCellsClue[] = [];
    const odd: FPuzzlesCellClue[] = [];
    const even: FPuzzlesCellClue[] = [];

    const exportCells = (cells: readonly CellId[]): string[] | undefined => {
        const out: string[] = [];
        for (const c of cells) {
            const f = toFPuzzlesCell(c);
            if (!f) return undefined;
            out.push(f);
        }
        return out;
    };

    for (const spec of def.constraints) {
        if (!isDefinitionRef(spec)) {
            warnings.push("a hand-written primitive constraint cannot be represented in f-puzzles export; dropped");
            continue;
        }
        const { use, ...params } = spec;
        if (use === "sudoku") continue; // implied by the grid + regions above

        if (use === "killer") {
            const cells = exportCells(params.cells as CellId[]);
            if (!cells) {
                warnings.push("killer cage with a non-grid cell id was skipped");
                continue;
            }
            cage.push({ cells, ...(typeof params.sum === "number" ? { value: String(params.sum) } : {}) });
        } else if (use === "thermometer") {
            const cells = exportCells(params.cells as CellId[]);
            if (!cells) {
                warnings.push("thermometer with a non-grid cell id was skipped");
                continue;
            }
            thermometer.push({ lines: [cells] });
        } else if (use === "arrow") {
            const bulbRaw = params.bulb;
            const bulbCells = Array.isArray(bulbRaw) ? (bulbRaw as CellId[]) : typeof bulbRaw === "string" ? [bulbRaw] : [];
            const bulb = exportCells(bulbCells);
            const shaft = exportCells(params.cells as CellId[]);
            if (!bulb || !shaft) {
                warnings.push("arrow with a non-grid cell id was skipped");
                continue;
            }
            // The line carries the bulb cell(s) as its leading entries, same as a
            // real f-puzzles export does (see the importer's matching comment).
            arrow.push({ cells: bulb, lines: [[...bulb, ...shaft]] });
        } else if (use === "kropkiDifference" || use === "kropkiRatio") {
            const cells = exportCells(params.cells as CellId[]);
            if (!cells) {
                warnings.push(`${use} with a non-grid cell id was skipped`);
                continue;
            }
            const value = typeof params.value === "number" ? String(params.value) : undefined;
            (use === "kropkiDifference" ? difference : ratio).push({ cells, ...(value ? { value } : {}) });
        } else if (use === "odd" || use === "even") {
            const raw = typeof params.cell === "string" ? params.cell : Array.isArray(params.cells) ? params.cells[0] : undefined;
            const cell = typeof raw === "string" ? toFPuzzlesCell(raw) : undefined;
            if (!cell) {
                warnings.push(`${use} marker with a non-grid cell id was skipped`);
                continue;
            }
            (use === "odd" ? odd : even).push({ cell });
        } else {
            warnings.push(`constraint using definition "${use}" cannot be represented in f-puzzles export; dropped`);
        }
    }

    const data: FPuzzlesExport = {
        size,
        grid,
        title: def.metadata.title,
        ...(def.metadata.author ? { author: def.metadata.author } : {}),
        ...(def.metadata.description ? { ruleset: def.metadata.description } : {}),
        ...(cage.length > 0 ? { killercage: cage } : {}),
        ...(thermometer.length > 0 ? { thermometer } : {}),
        ...(arrow.length > 0 ? { arrow } : {}),
        ...(difference.length > 0 ? { difference } : {}),
        ...(ratio.length > 0 ? { ratio } : {}),
        ...(odd.length > 0 ? { odd } : {}),
        ...(even.length > 0 ? { even } : {}),
    };

    if (def.solution) {
        const cells = geometry.cells;
        if (cells.every((c) => def.solution?.[c] !== undefined)) {
            data.solution = cells.map((c) => String(def.solution?.[c]));
        } else {
            warnings.push("solution is incomplete; omitted from export");
        }
    }

    return { data, warnings };
};

/** The inverse of the share-link decoding in `importFPuzzles`: lz-string
 *  `compressToBase64`, dropped into the same `?load=` query param. */
export const encodeFPuzzlesShareLink = (data: FPuzzlesExport): string =>
    `https://f-puzzles.com/?load=${compressToBase64(JSON.stringify(data))}`;
