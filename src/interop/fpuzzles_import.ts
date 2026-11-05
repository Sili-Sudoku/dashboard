/** f-puzzles JSON -> PuzzleDefinition. See `fpuzzles.ts` for what is covered. */

import { decompressFromBase64 } from "lz-string";
import { LIMITS } from "@/runtime/serialization.ts";
import { GridGeometry, type CellId, type GridGeometrySpec } from "@/runtime/geometry.ts";
import { findRectangularBoxes, slugify } from "@/interop/shared.ts";
import { isDefinitionRef, type ConstraintSpec, type PuzzleDefinition } from "@/runtime/puzzle.ts";
import {
    type FPuzzlesCell,
    type FPuzzlesCellsClue,
    type FPuzzlesLinesClue,
    type FPuzzlesArrowClue,
    type FPuzzlesCloneClue,
    type FPuzzlesQuadrupleClue,
    type FPuzzlesCellClue,
    type FPuzzlesOutsideClue,
    type FPuzzlesLittleKillerClue,
    type ImportResult,
    toProjectCell,
    mapCells,
    outsideCellCoords,
    sandwichCellsFromAnchor,
    littleKillerCellsFromAnchor,
    range,
} from "@/interop/fpuzzles_format.ts";

export const KNOWN_TOP_LEVEL_KEYS = new Set([
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
    "diagonal+",
    "diagonal-",
    "antiknight",
    "antiking",
    "disjointgroups",
    "nonconsecutive",
    "palindrome",
    "clone",
    "quadruple",
    "minimum",
    "maximum",
    "xv",
    "littlekillersum",
    "sandwichsum",
    "betweenline",
    "negative",
]);

/** The entries of the "negative" array change with the exporter.
 *  Map the synonyms seen in real files to the canonical kind that already has its own importer branch
 *  (kropki difference, kropki ratio, xv). Do this before the lookup of its pairs. */
const NEGATIVE_KIND_ALIASES: Record<string, "difference" | "ratio" | "xv"> = {
    difference: "difference",
    differentpair: "difference",
    nonconsecutive: "difference",
    ratio: "ratio",
    xv: "xv",
};

/**
 * f-puzzles.com shares a puzzle as a URL with a "load" query parameter (`?load=<payload>`).
 * The payload is the JSON, lz-string-compressed and base64-encoded. It is not raw JSON.
 * A real share link confirmed this.
 * It also confirmed that the payload is NOT percent-encoded: it has literal "+" and "/" base64 characters.
 * So this code deliberately does not use `URLSearchParams` or `decodeURIComponent`.
 * Those apply form-urlencoded decoding. That decoding turns a literal "+" into a space
 * and silently corrupts the payload.
 */
const extractShareLinkPayload = (text: string): string => {
    const m = /[?&]load=([^&#]+)/.exec(text);
    return m ? m[1] : text;
};

export const importFPuzzles = (input: unknown): ImportResult | Error => {
    let data: unknown = input;
    if (typeof input === "string") {
        const trimmed = input.trim();
        if (trimmed.length > LIMITS.jsonChars) return new Error("the input is too long");
        let jsonText = trimmed;
        if (!trimmed.startsWith("{")) {
            const payload = extractShareLinkPayload(trimmed);
            if (payload.length > LIMITS.lzInputChars) return new Error("the f-puzzles share link is too long");
            // The input is not raw JSON. Treat it as a share link (a full URL, or only the "load"
            // payload copied alone) and try to decompress it first.
            const decompressed = decompressFromBase64(payload);
            if (!decompressed) {
                return new Error(
                    "input is not f-puzzles JSON and not an f-puzzles share link that the importer can decode",
                );
            }
            if (decompressed.length > LIMITS.jsonChars) {
                return new Error("the f-puzzles data is too large when unpacked");
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
        return new Error('"size" must be a positive integer. The importer supports only square grids');
    }
    if (size * size > LIMITS.cells) {
        return new Error(`the grid is too large (${size}x${size}, the limit is ${LIMITS.cells} cells)`);
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
        // f-puzzles omits the per-cell "region" for puzzles that use the default box shape.
        // A real exported classic-sudoku-shaped puzzle had no region data, but it still has standard boxes.
        // So when the grid size is a perfect square, use the own sqrt-based box size of the geometry.
        // Do not disable boxes outright.
        // For a size that is not a square (e.g. 6), that default is one box that covers the whole grid
        // (see defaultBox in geometry.ts). That makes `allDifferent` impossible to satisfy.
        // So boxes stay disabled there.
        const root = Math.sqrt(size);
        if (Number.isInteger(root)) {
            warnings.push(
                "not every cell has a region. The importer uses the default grid " +
                    `${root}x${root} box size. This is correct for a puzzle with standard boxes. ` +
                    "It is wrong if the source uses custom boxes or no boxes and does not say so",
            );
            sudokuRef = { use: "sudoku" };
        } else {
            warnings.push("not every cell has a region. The importer omits the box/region all-different constraint");
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
                "regions are not a uniform rectangular tiling (jigsaw sudoku). The box constraint is correct. " +
                    "The renderer always draws rectangular box lines from the grid size. " +
                    "The drawn grid lines do not match these regions yet",
            );
            sudokuRef = { use: "sudoku", boxes: false, extraRegions: Object.keys(named).sort() };
        }
    }

    // Diagonals use the generic named-region + extraRegions mechanism that `sudoku.ts` already exposes.
    // They need no new definition. Build the cell list and pass it on the same way as jigsaw regions.
    const diagonalFlags: { key: "diagonal+" | "diagonal-"; name: string; cells: () => CellId[] }[] = [
        { key: "diagonal+", name: "diagonal:bltr", cells: () => range(size).map((i) => `r${size - i}c${i + 1}`) },
        { key: "diagonal-", name: "diagonal:tlbr", cells: () => range(size).map((i) => `r${i + 1}c${i + 1}`) },
    ];
    const extraDiagonalNames: string[] = [];
    for (const d of diagonalFlags) {
        if (src[d.key]) {
            regions = { ...(regions ?? {}), [d.name]: d.cells() };
            extraDiagonalNames.push(d.name);
        }
    }
    if (extraDiagonalNames.length > 0 && isDefinitionRef(sudokuRef)) {
        const existingExtra = Array.isArray(sudokuRef.extraRegions) ? (sudokuRef.extraRegions as string[]) : [];
        sudokuRef = { ...sudokuRef, extraRegions: [...existingExtra, ...extraDiagonalNames] };
    }

    const constraints: ConstraintSpec[] = [sudokuRef];

    if (src.antiknight) constraints.push({ use: "antiknight" });
    if (src.antiking) constraints.push({ use: "antiking" });
    if (src.nonconsecutive) constraints.push({ use: "nonconsecutive" });
    if (src.disjointgroups) {
        // disjointgroups reads the own box:N selectors of the geometry.
        // So it is valid only when those selectors match the real boxes of the puzzle
        // (not jigsaw, and not degenerate or disabled).
        const boxesUsable = !regions || Object.keys(regions).every((name) => name.startsWith("diagonal:"));
        const probeGeometry = boxesUsable ? new GridGeometry(geometry) : undefined;
        if (probeGeometry?.resolveRegion("box:0")) {
            constraints.push({ use: "disjointgroups" });
        } else {
            warnings.push(
                "disjointgroups: the grid has no uniform box layout to pair positions across. The importer omits it",
            );
        }
    }

    for (const clue of (src.killercage as FPuzzlesCellsClue[] | undefined) ?? []) {
        const cells = mapCells(clue.cells);
        if (!cells) {
            warnings.push("the importer skipped a cage with an unknown cell id");
            continue;
        }
        const sum = typeof clue.value === "string" ? Number(clue.value) : clue.value;
        constraints.push({ use: "killer", cells, ...(typeof sum === "number" && Number.isFinite(sum) ? { sum } : {}) });
    }

    for (const clue of (src.thermometer as FPuzzlesLinesClue[] | undefined) ?? []) {
        for (const line of clue.lines ?? []) {
            const cells = mapCells(line);
            if (!cells || cells.length < 2) {
                warnings.push("the importer skipped a thermometer line with an unknown cell id or too few cells");
                continue;
            }
            constraints.push({ use: "thermometer", cells });
        }
    }

    for (const clue of (src.arrow as FPuzzlesArrowClue[] | undefined) ?? []) {
        const bulbCells = clue.cells ? mapCells(clue.cells) : undefined;
        if (clue.cells && !bulbCells) {
            warnings.push("the importer skipped an arrow with an unknown bulb cell");
            continue;
        }
        for (const line of clue.lines ?? []) {
            const cells = mapCells(line);
            if (!cells || cells.length === 0) {
                warnings.push("the importer skipped an arrow line with an unknown cell id");
                continue;
            }
            // The leading cell(s) of the line are always the bulb. "cells" can repeat them or not.
            // A real f-puzzles export confirmed this: an arrow with a one-cell bulb
            // has lines: [[bulb, ...shaft]] and cells: [bulb] at the same time.
            // So the shaft is always the line with the bulb cell(s) removed from the front.
            // It is never the full line.
            const bulb = bulbCells && bulbCells.length > 0 ? bulbCells : [cells[0]];
            const shaft = cells.slice(bulb.length);
            if (shaft.length === 0) {
                warnings.push("the importer skipped an arrow with an empty shaft");
                continue;
            }
            constraints.push({ use: "arrow", bulb: bulb.length === 1 ? bulb[0] : bulb, cells: shaft });
        }
    }

    const explicitDifferencePairs: CellId[][] = [];
    const explicitRatioPairs: CellId[][] = [];
    const importDot = (
        use: "kropkiDifference" | "kropkiRatio",
        clues: readonly FPuzzlesCellsClue[] | undefined,
        explicitPairs: CellId[][],
    ) => {
        for (const clue of clues ?? []) {
            const cells = mapCells(clue.cells);
            if (!cells || cells.length !== 2) {
                warnings.push(`the importer skipped a ${use} dot with unexpected cells`);
                continue;
            }
            explicitPairs.push(cells);
            const value = typeof clue.value === "string" ? Number(clue.value) : clue.value;
            constraints.push({
                use,
                cells,
                ...(typeof value === "number" && Number.isFinite(value) && value > 0 ? { value } : {}),
            });
        }
    };
    importDot("kropkiDifference", src.difference as FPuzzlesCellsClue[] | undefined, explicitDifferencePairs);
    importDot("kropkiRatio", src.ratio as FPuzzlesCellsClue[] | undefined, explicitRatioPairs);

    const importCellMarker = (
        use: "odd" | "even" | "minimum" | "maximum",
        clues: readonly FPuzzlesCellClue[] | undefined,
    ) => {
        for (const clue of clues ?? []) {
            const raw = typeof clue === "string" ? clue : clue.cell;
            const cell = toProjectCell(raw);
            if (!cell) {
                warnings.push(`the importer skipped a ${use} marker with an unknown cell id`);
                continue;
            }
            constraints.push({ use, cell });
        }
    };
    importCellMarker("odd", src.odd as FPuzzlesCellClue[] | undefined);
    importCellMarker("even", src.even as FPuzzlesCellClue[] | undefined);
    importCellMarker("minimum", src.minimum as FPuzzlesCellClue[] | undefined);
    importCellMarker("maximum", src.maximum as FPuzzlesCellClue[] | undefined);

    for (const clue of (src.littlekillersum as FPuzzlesLittleKillerClue[] | undefined) ?? []) {
        const anchor = outsideCellCoords(clue.cell);
        const cells = anchor && littleKillerCellsFromAnchor(anchor, clue.direction, size);
        if (!cells) {
            warnings.push("the importer skipped a littlekillersum with an unknown anchor cell or direction");
            continue;
        }
        const sum = typeof clue.value === "string" ? Number(clue.value) : clue.value;
        if (typeof sum !== "number" || !Number.isFinite(sum)) {
            warnings.push("the importer skipped a littlekillersum with no numeric sum");
            continue;
        }
        constraints.push({ use: "killer", cells, sum, distinct: false });
    }

    for (const clue of (src.sandwichsum as FPuzzlesOutsideClue[] | undefined) ?? []) {
        const anchor = outsideCellCoords(clue.cell);
        const cells = anchor && sandwichCellsFromAnchor(anchor, size);
        if (!cells) {
            warnings.push("the importer skipped a sandwichsum with an unknown anchor cell");
            continue;
        }
        const sum = typeof clue.value === "string" ? Number(clue.value) : clue.value;
        if (typeof sum !== "number" || !Number.isFinite(sum)) {
            warnings.push("the importer skipped a sandwichsum with no numeric sum");
            continue;
        }
        constraints.push({ use: "sandwich", cells, sum });
    }

    for (const clue of (src.betweenline as FPuzzlesLinesClue[] | undefined) ?? []) {
        for (const line of clue.lines ?? []) {
            const cells = mapCells(line);
            if (!cells || cells.length < 3) {
                warnings.push("the importer skipped a betweenline with an unknown cell id or too few cells");
                continue;
            }
            constraints.push({ use: "betweenline", cells });
        }
    }

    for (const clue of (src.palindrome as FPuzzlesLinesClue[] | undefined) ?? []) {
        for (const line of clue.lines ?? []) {
            const cells = mapCells(line);
            if (!cells || cells.length < 2) {
                warnings.push("the importer skipped a palindrome line with an unknown cell id or too few cells");
                continue;
            }
            constraints.push({ use: "palindrome", cells });
        }
    }

    for (const clue of (src.clone as FPuzzlesCloneClue[] | undefined) ?? []) {
        const cells = mapCells(clue.cells);
        const cloneCells = mapCells(clue.cloneCells);
        if (!cells || !cloneCells || cells.length !== cloneCells.length) {
            warnings.push("the importer skipped a clone with unknown or mismatched cells");
            continue;
        }
        constraints.push({ use: "clone", cells, cloneCells });
    }

    for (const clue of (src.quadruple as FPuzzlesQuadrupleClue[] | undefined) ?? []) {
        const cells = mapCells(clue.cells);
        if (!cells || !Array.isArray(clue.values) || clue.values.length === 0) {
            warnings.push("the importer skipped a quadruple with unknown cells or no values");
            continue;
        }
        constraints.push({ use: "quadruple", cells, values: clue.values });
    }

    const explicitXVPairs: CellId[][] = [];
    for (const clue of (src.xv as FPuzzlesCellsClue[] | undefined) ?? []) {
        const cells = mapCells(clue.cells);
        const target = clue.value === "X" ? 10 : clue.value === "V" ? 5 : undefined;
        if (!cells || cells.length !== 2 || target === undefined) {
            warnings.push("the importer skipped an xv marker with unknown cells or an unknown marker");
            continue;
        }
        explicitXVPairs.push(cells);
        constraints.push({ use: "xv", cells, target });
    }

    const negativeKindsSeen = new Set<"difference" | "ratio" | "xv">();
    for (const raw of (src.negative as unknown[] | undefined) ?? []) {
        if (typeof raw !== "string") {
            warnings.push(`the importer ignored "negative" entry ${JSON.stringify(raw)} because it is not a string`);
            continue;
        }
        const kind = NEGATIVE_KIND_ALIASES[raw.toLowerCase()];
        if (!kind) {
            warnings.push(`the importer ignored "negative" entry "${raw}" because it is not a known kind`);
            continue;
        }
        if (negativeKindsSeen.has(kind)) continue;
        negativeKindsSeen.add(kind);
        if (kind === "difference") {
            constraints.push({ use: "negativeDifference", excludePairs: explicitDifferencePairs });
        } else if (kind === "ratio") {
            constraints.push({ use: "negativeRatio", excludePairs: explicitRatioPairs });
        } else {
            constraints.push({ use: "negativeXV", excludePairs: explicitXVPairs });
        }
    }

    for (const key of Object.keys(src)) {
        if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
            warnings.push(`the importer does not support clue type "${key}" and ignores it`);
        }
    }

    let solution: Record<CellId, number> | undefined;
    const rawSolution = src.solution;
    if (Array.isArray(rawSolution) && rawSolution.length === size * size) {
        const parsed = (rawSolution as unknown[]).map((v) => (typeof v === "string" ? Number(v) : v));
        if (parsed.every((v): v is number => typeof v === "number" && Number.isFinite(v) && domain.includes(v))) {
            solution = {};
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    solution[`r${r + 1}c${c + 1}`] = parsed[r * size + c];
                }
            }
        } else {
            warnings.push('"solution" is present but not valid. The importer ignores it');
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
