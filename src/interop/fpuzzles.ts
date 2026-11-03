/**
 * f-puzzles JSON interop (import/export).
 *
 * f-puzzles is the common exchange format for hand-made variant sudokus.
 * SudokuPad, Logic Mines and Crack The Cuber also use its JSON export.
 * This module is a separate adapter. It is isolated from the generic runtime, like `runtime/serialization.ts`.
 * Nothing in `src/runtime` or `src/definitions` knows this format exists.
 *
 * The shape below is rebuilt from community documentation of the public f-puzzles export.
 * The sandbox has no network route to f-puzzles.com, so the live spec is not checked.
 * The shape can differ from some exporters or versions.
 * Check a real exported file before you rely on an import.
 * Covers: classic sudoku (including jigsaw regions and diagonals), givens,
 * killer cages (and little killer sums), thermometers, arrows, kropki dots (difference/ratio), xv,
 * odd/even and minimum/maximum markers, palindrome/between lines, clones, quadruples, sandwich sums,
 * the antiknight/antiking/nonconsecutive/disjointgroups global flags,
 * and the "negative" global ratio/difference/xv exclusion flags.
 * The importer reports any other data in the source as a warning. It never drops data silently.
 * It also reports a supported clue whose cells do not resolve.
 *
 * sandwichsum and littlekillersum are NOT a resolved-cells list like the other clue types.
 * A real f-puzzles.com import crash (`currentSandwich.set is null`) showed this on our first guess.
 * Each has one anchor cell just *outside* the grid edge or corner (e.g. "R0C4" is above column 4).
 * littlekillersum also has a `direction` ("UL"/"UR"/"DL"/"DR").
 * The direction gives the diagonal that runs back into the grid from that corner.
 * See `outsideCellCoords`/`sandwichAnchor`/`littleKillerAnchor` below.
 */

import { compressToBase64, decompressFromBase64 } from "lz-string";

import { LIMITS } from "@/runtime/serialization.ts";
import { GridGeometry, parseGridCellId, type CellId, type GridGeometrySpec } from "@/runtime/geometry.ts";
import { findRectangularBoxes, slugify } from "@/interop/shared.ts";
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

export interface FPuzzlesCloneClue {
    cells: string[];
    cloneCells: string[];
}

export interface FPuzzlesQuadrupleClue {
    cells: string[];
    values: number[];
}

export type FPuzzlesCellClue = string | { cell: string };

/** Anchored one cell outside the grid edge (e.g. "R0C4" is above column 4). It needs no direction. */
export interface FPuzzlesOutsideClue {
    cell: string;
    value?: string | number;
}

/** Anchored one cell outside the grid corner. It has a diagonal direction back into the grid. */
export interface FPuzzlesLittleKillerClue {
    cell: string;
    direction: "UL" | "UR" | "DL" | "DR";
    value?: string | number;
}

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
    "diagonal+"?: boolean;
    "diagonal-"?: boolean;
    antiknight?: boolean;
    antiking?: boolean;
    disjointgroups?: boolean;
    nonconsecutive?: boolean;
    palindrome?: FPuzzlesLinesClue[];
    clone?: FPuzzlesCloneClue[];
    quadruple?: FPuzzlesQuadrupleClue[];
    minimum?: FPuzzlesCellClue[];
    maximum?: FPuzzlesCellClue[];
    xv?: FPuzzlesCellsClue[];
    littlekillersum?: FPuzzlesLittleKillerClue[];
    sandwichsum?: FPuzzlesOutsideClue[];
    betweenline?: FPuzzlesLinesClue[];
    negative?: string[];
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
 * Parse an "R{row}C{col}" cell reference. The cell can be outside the grid.
 * `toProjectCell` is different: it resolves only cells that are part of the puzzle.
 * f-puzzles puts sandwich and little killer clues on anchor cells outside the grid
 * (0-indexed row 0 or `size+1`, the same for column).
 * So these clues need the raw coordinates, which can be out of range. They cannot use a validated `CellId`.
 */
const outsideCellCoords = (cell: string): { row: number; col: number } | undefined => {
    const m = /^[Rr](\d+)[Cc](\d+)$/.exec(cell);
    if (!m) return undefined;
    return { row: Number(m[1]), col: Number(m[2]) };
};

const DIAGONAL_DELTA: Record<"UL" | "UR" | "DL" | "DR", { dr: number; dc: number }> = {
    UL: { dr: -1, dc: -1 },
    UR: { dr: -1, dc: 1 },
    DL: { dr: 1, dc: -1 },
    DR: { dr: 1, dc: 1 },
};

/** Decode a sandwichsum anchor (just above/below a column, or left/right of a row)
 *  into the full row/column of cells that it sums. */
const sandwichCellsFromAnchor = (anchor: { row: number; col: number }, size: number): CellId[] | undefined => {
    const rowInGrid = anchor.row >= 1 && anchor.row <= size;
    const colInGrid = anchor.col >= 1 && anchor.col <= size;
    if (rowInGrid && !colInGrid) return range(size).map((i) => `r${anchor.row}c${i + 1}`);
    if (colInGrid && !rowInGrid) return range(size).map((i) => `r${i + 1}c${anchor.col}`);
    return undefined;
};

/** Encode the full row/column of cells of a sandwich back into its anchor cell outside the grid. */
const sandwichAnchor = (cells: readonly CellId[], size: number): string | undefined => {
    if (cells.length !== size) return undefined;
    const coords = cells.map(parseGridCellId);
    if (coords.some((c) => !c)) return undefined;
    const pts = coords as { row: number; col: number }[];
    const rows = new Set(pts.map((p) => p.row));
    const cols = new Set(pts.map((p) => p.col));
    if (rows.size === 1 && cols.size === size) return `R${pts[0].row + 1}C0`;
    if (cols.size === 1 && rows.size === size) return `R0C${pts[0].col + 1}`;
    return undefined;
};

/** Decode a littlekillersum anchor and direction into the diagonal run of in-grid cells that it sums. */
const littleKillerCellsFromAnchor = (
    anchor: { row: number; col: number },
    direction: string,
    size: number,
): CellId[] | undefined => {
    const delta = DIAGONAL_DELTA[direction as keyof typeof DIAGONAL_DELTA];
    if (!delta) return undefined;
    const cells: CellId[] = [];
    let row = anchor.row + delta.dr;
    let col = anchor.col + delta.dc;
    while (row >= 1 && row <= size && col >= 1 && col <= size) {
        cells.push(`r${row}c${col}`);
        row += delta.dr;
        col += delta.dc;
    }
    return cells.length > 0 ? cells : undefined;
};

/** Encode the diagonal run of cells of a littlekillersum back into
 *  its anchor cell outside the grid and its direction. */
const littleKillerAnchor = (
    cells: readonly CellId[],
): { cell: string; direction: "UL" | "UR" | "DL" | "DR" } | undefined => {
    if (cells.length < 2) return undefined;
    const coords = cells.map(parseGridCellId);
    if (coords.some((c) => !c)) return undefined;
    const pts = coords as { row: number; col: number }[];
    const dr = pts[1].row - pts[0].row;
    const dc = pts[1].col - pts[0].col;
    if (Math.abs(dr) !== 1 || Math.abs(dc) !== 1) return undefined;
    for (let i = 1; i < pts.length; i++) {
        if (pts[i].row - pts[i - 1].row !== dr || pts[i].col - pts[i - 1].col !== dc) return undefined;
    }
    const direction = (Object.keys(DIAGONAL_DELTA) as (keyof typeof DIAGONAL_DELTA)[]).find(
        (name) => DIAGONAL_DELTA[name].dr === dr && DIAGONAL_DELTA[name].dc === dc,
    );
    if (!direction) return undefined;
    return { cell: `R${pts[0].row - dr + 1}C${pts[0].col - dc + 1}`, direction };
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

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

// --- import -------------------------------------------------------------

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

// --- export -------------------------------------------------------------

export const exportFPuzzles = (def: PuzzleDefinition): ExportResult | Error => {
    if (def.geometry.type !== "grid") return new Error("f-puzzles export supports only grid geometries");
    const { width, height } = def.geometry;
    if (width !== height) return new Error("f-puzzles export supports only square grids");
    const size = width;

    const warnings: string[] = [];
    const geometry = new GridGeometry(def.geometry);

    const diagonalPlus = Object.keys(def.regions ?? {}).includes("diagonal:bltr");
    const diagonalMinus = Object.keys(def.regions ?? {}).includes("diagonal:tlbr");

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
    const minimumClues: FPuzzlesCellClue[] = [];
    const maximumClues: FPuzzlesCellClue[] = [];
    const palindromeLines: FPuzzlesLinesClue[] = [];
    const cloneClues: FPuzzlesCloneClue[] = [];
    const quadrupleClues: FPuzzlesQuadrupleClue[] = [];
    const xvClues: FPuzzlesCellsClue[] = [];
    const littlekillersumClues: FPuzzlesLittleKillerClue[] = [];
    const sandwichsumClues: FPuzzlesOutsideClue[] = [];
    const betweenlineLines: FPuzzlesLinesClue[] = [];
    let antiknightFlag = false;
    let antikingFlag = false;
    let nonconsecutiveFlag = false;
    let disjointgroupsFlag = false;
    const negativeKinds = new Set<"difference" | "ratio" | "xv">();

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
            warnings.push(
                "f-puzzles export cannot represent a hand-written primitive constraint. The exporter drops it",
            );
            continue;
        }
        const { use, ...params } = spec;
        if (use === "sudoku") continue; // the grid and the regions above already imply it

        if (use === "killer") {
            if (params.distinct === false) {
                const cellsParam = params.cells as CellId[];
                const anchor = littleKillerAnchor(cellsParam);
                if (!anchor || typeof params.sum !== "number") {
                    warnings.push(
                        "the exporter skipped a littlekillersum with cells that are not a straight diagonal, or with no sum",
                    );
                    continue;
                }
                littlekillersumClues.push({
                    cell: anchor.cell,
                    direction: anchor.direction,
                    value: String(params.sum),
                });
                continue;
            }
            const cells = exportCells(params.cells as CellId[]);
            if (!cells) {
                warnings.push("the exporter skipped a killer cage with a non-grid cell id");
                continue;
            }
            cage.push({ cells, ...(typeof params.sum === "number" ? { value: String(params.sum) } : {}) });
        } else if (use === "thermometer") {
            const cells = exportCells(params.cells as CellId[]);
            if (!cells) {
                warnings.push("the exporter skipped a thermometer with a non-grid cell id");
                continue;
            }
            thermometer.push({ lines: [cells] });
        } else if (use === "arrow") {
            const bulbRaw = params.bulb;
            const bulbCells = Array.isArray(bulbRaw)
                ? (bulbRaw as CellId[])
                : typeof bulbRaw === "string"
                  ? [bulbRaw]
                  : [];
            const bulb = exportCells(bulbCells);
            const shaft = exportCells(params.cells as CellId[]);
            if (!bulb || !shaft) {
                warnings.push("the exporter skipped an arrow with a non-grid cell id");
                continue;
            }
            // The line has the bulb cell(s) as its leading entries.
            // A real f-puzzles export does the same (see the matching comment in the importer).
            arrow.push({ cells: bulb, lines: [[...bulb, ...shaft]] });
        } else if (use === "kropkiDifference" || use === "kropkiRatio") {
            const cells = exportCells(params.cells as CellId[]);
            if (!cells) {
                warnings.push(`the exporter skipped a ${use} with a non-grid cell id`);
                continue;
            }
            const value = typeof params.value === "number" ? String(params.value) : undefined;
            (use === "kropkiDifference" ? difference : ratio).push({ cells, ...(value ? { value } : {}) });
        } else if (use === "odd" || use === "even") {
            const raw =
                typeof params.cell === "string"
                    ? params.cell
                    : Array.isArray(params.cells)
                      ? (params.cells as unknown[])[0]
                      : undefined;
            const cell = typeof raw === "string" ? toFPuzzlesCell(raw) : undefined;
            if (!cell) {
                warnings.push(`the exporter skipped a ${use} marker with a non-grid cell id`);
                continue;
            }
            (use === "odd" ? odd : even).push({ cell });
        } else if (use === "minimum" || use === "maximum") {
            const raw =
                typeof params.cell === "string"
                    ? params.cell
                    : Array.isArray(params.cells)
                      ? (params.cells as unknown[])[0]
                      : undefined;
            const cell = typeof raw === "string" ? toFPuzzlesCell(raw) : undefined;
            if (!cell) {
                warnings.push(`the exporter skipped a ${use} marker with a non-grid cell id`);
                continue;
            }
            (use === "minimum" ? minimumClues : maximumClues).push({ cell });
        } else if (use === "antiknight" || use === "antiking" || use === "nonconsecutive" || use === "disjointgroups") {
            if (use === "antiknight") antiknightFlag = true;
            if (use === "antiking") antikingFlag = true;
            if (use === "nonconsecutive") nonconsecutiveFlag = true;
            if (use === "disjointgroups") disjointgroupsFlag = true;
        } else if (use === "palindrome") {
            const cells = exportCells(params.cells as CellId[]);
            if (!cells) {
                warnings.push("the exporter skipped a palindrome with a non-grid cell id");
                continue;
            }
            palindromeLines.push({ lines: [cells] });
        } else if (use === "clone") {
            const cells = exportCells(params.cells as CellId[]);
            const cloneCells = exportCells(params.cloneCells as CellId[]);
            if (!cells || !cloneCells) {
                warnings.push("the exporter skipped a clone with a non-grid cell id");
                continue;
            }
            cloneClues.push({ cells, cloneCells });
        } else if (use === "quadruple") {
            const cells = exportCells(params.cells as CellId[]);
            const values = Array.isArray(params.values) ? (params.values as number[]) : undefined;
            if (!cells || !values) {
                warnings.push("the exporter skipped a quadruple with a non-grid cell id or no values");
                continue;
            }
            quadrupleClues.push({ cells, values });
        } else if (use === "xv") {
            const cells = exportCells(params.cells as CellId[]);
            const marker = params.target === 10 ? "X" : params.target === 5 ? "V" : undefined;
            if (!cells || !marker) {
                warnings.push(
                    "the exporter skipped an xv marker with a non-grid cell id or a target it cannot represent",
                );
                continue;
            }
            xvClues.push({ cells, value: marker });
        } else if (use === "sandwich") {
            const cellsParam = params.cells as CellId[];
            const anchor = sandwichAnchor(cellsParam, size);
            if (!anchor || typeof params.sum !== "number") {
                warnings.push(
                    "the exporter skipped a sandwich with cells that are not a full row or column, or with no sum",
                );
                continue;
            }
            sandwichsumClues.push({ cell: anchor, value: String(params.sum) });
        } else if (use === "betweenline") {
            const cells = exportCells(params.cells as CellId[]);
            if (!cells) {
                warnings.push("the exporter skipped a betweenline with a non-grid cell id");
                continue;
            }
            betweenlineLines.push({ lines: [cells] });
        } else if (use === "negativeDifference" || use === "negativeRatio" || use === "negativeXV") {
            negativeKinds.add(use === "negativeDifference" ? "difference" : use === "negativeRatio" ? "ratio" : "xv");
        } else {
            warnings.push(
                `f-puzzles export cannot represent the constraint that uses definition "${use}". The exporter drops it`,
            );
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
        ...(diagonalPlus ? { "diagonal+": true } : {}),
        ...(diagonalMinus ? { "diagonal-": true } : {}),
        ...(antiknightFlag ? { antiknight: true } : {}),
        ...(antikingFlag ? { antiking: true } : {}),
        ...(nonconsecutiveFlag ? { nonconsecutive: true } : {}),
        ...(disjointgroupsFlag ? { disjointgroups: true } : {}),
        ...(palindromeLines.length > 0 ? { palindrome: palindromeLines } : {}),
        ...(cloneClues.length > 0 ? { clone: cloneClues } : {}),
        ...(quadrupleClues.length > 0 ? { quadruple: quadrupleClues } : {}),
        ...(minimumClues.length > 0 ? { minimum: minimumClues } : {}),
        ...(maximumClues.length > 0 ? { maximum: maximumClues } : {}),
        ...(xvClues.length > 0 ? { xv: xvClues } : {}),
        ...(littlekillersumClues.length > 0 ? { littlekillersum: littlekillersumClues } : {}),
        ...(sandwichsumClues.length > 0 ? { sandwichsum: sandwichsumClues } : {}),
        ...(betweenlineLines.length > 0 ? { betweenline: betweenlineLines } : {}),
        ...(negativeKinds.size > 0 ? { negative: [...negativeKinds] } : {}),
    };

    if (def.solution) {
        const cells = geometry.cells;
        if (cells.every((c) => def.solution?.[c] !== undefined)) {
            data.solution = cells.map((c) => String(def.solution?.[c]));
        } else {
            warnings.push("the solution is incomplete. The exporter omits it");
        }
    }

    return { data, warnings };
};

/** The inverse of the share-link decoding in `importFPuzzles`.
 *  It uses lz-string `compressToBase64` and puts the result in the same `?load=` query param. */
export const encodeFPuzzlesShareLink = (data: FPuzzlesExport): string =>
    `https://f-puzzles.com/?load=${compressToBase64(JSON.stringify(data))}`;

/** SudokuPad reads the same f-puzzles JSON payload with the same lz-string compression.
 *  It uses its own URL scheme (`sudokupad.app/fpuzzles<data>`).
 *  The payload goes directly after the path. It is not a `?load=` query param.
 *  The export does not go through f-puzzles.com.
 *  This is not verified against the live site: sudokupad.app is not on the network allowlist of this sandbox.
 *  Check it against a real SudokuPad load before you rely on it. */
export const encodeSudokuPadShareLink = (data: FPuzzlesExport): string =>
    `https://sudokupad.app/fpuzzles${compressToBase64(JSON.stringify(data))}`;
