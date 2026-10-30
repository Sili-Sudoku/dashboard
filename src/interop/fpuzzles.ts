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
 * before relying on an import. Covers: classic sudoku (including jigsaw
 * regions and diagonals), givens, killer cages (and little killer sums),
 * thermometers, arrows, kropki dots (difference/ratio), xv, odd/even and
 * minimum/maximum markers, palindrome/between lines, clones, quadruples,
 * sandwich sums, the antiknight/antiking/nonconsecutive/disjointgroups
 * global flags, and the "negative" global ratio/difference/xv exclusion
 * flags. Anything else present in the source is reported as a warning,
 * never silently dropped — same for any supported clue whose cells don't
 * resolve.
 *
 * sandwichsum/littlekillersum are NOT a resolved-cells list like the other
 * clue types — confirmed the hard way, via a real f-puzzles.com import
 * crash (`currentSandwich.set is null`) on our first guess. Both are
 * anchored by a single cell just *outside* the grid edge/corner (e.g.
 * "R0C4" sits above column 4); littlekillersum additionally carries a
 * `direction` ("UL"/"UR"/"DL"/"DR") for which diagonal runs back into the
 * grid from that corner. See `outsideCellCoords`/`sandwichAnchor`/
 * `littleKillerAnchor` below.
 */

import { compressToBase64, decompressFromBase64 } from "lz-string";

import { GridGeometry, parseGridCellId, type CellId, type GridGeometrySpec } from "@/runtime/geometry.ts";
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

/** Anchored one cell outside the grid edge (e.g. "R0C4" above column 4), no direction needed. */
export interface FPuzzlesOutsideClue {
    cell: string;
    value?: string | number;
}

/** Anchored one cell outside the grid corner, with a diagonal direction back into the grid. */
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

/** The "negative" array's entries vary by exporter -- fold the synonyms seen
 *  in the wild onto the canonical kind that already has its own importer
 *  branch (kropki difference, kropki ratio, xv) before looking up its pairs. */
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
 * Parse an "R{row}C{col}" cell reference without requiring it to be inside
 * the grid — unlike `toProjectCell`, which only resolves cells that are
 * actually part of the puzzle. Outside-the-grid anchor cells (0-indexed row
 * 0 or `size+1`, same for column) are how f-puzzles positions sandwich and
 * little killer clues, so they need their raw, possibly out-of-range
 * coordinates, not a validated `CellId`.
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

/** Decode a sandwichsum anchor (just above/below a column, or left/right of a row) into the full row/column of cells it sums across. */
const sandwichCellsFromAnchor = (anchor: { row: number; col: number }, size: number): CellId[] | undefined => {
    const rowInGrid = anchor.row >= 1 && anchor.row <= size;
    const colInGrid = anchor.col >= 1 && anchor.col <= size;
    if (rowInGrid && !colInGrid) return range(size).map((i) => `r${anchor.row}c${i + 1}`);
    if (colInGrid && !rowInGrid) return range(size).map((i) => `r${i + 1}c${anchor.col}`);
    return undefined;
};

/** Encode a sandwich's full row/column of cells back into its outside-the-grid anchor cell. */
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

/** Decode a littlekillersum anchor + direction into the diagonal run of in-grid cells it sums. */
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

/** Encode a littlekillersum's diagonal run of cells back into its outside-the-grid anchor cell + direction. */
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

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

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

    // Diagonals are exactly the generic named-region + extraRegions mechanism
    // `sudoku.ts` already exposes — no new definition needed, just synthesize
    // the cell list and thread it through the same way jigsaw regions are.
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
        // disjointgroups reads the geometry's own box:N selectors, so it's only
        // honorable when those selectors actually match the puzzle's real boxes
        // (not jigsaw, and not degenerate/disabled — see kanban #80).
        const boxesUsable = !regions || Object.keys(regions).every((name) => name.startsWith("diagonal:"));
        const probeGeometry = boxesUsable ? new GridGeometry(geometry) : undefined;
        if (probeGeometry?.resolveRegion("box:0")) {
            constraints.push({ use: "disjointgroups" });
        } else {
            warnings.push("disjointgroups: no uniform box layout to pair positions across; omitted");
        }
    }

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
                warnings.push(`${use} dot with unexpected cells was skipped`);
                continue;
            }
            explicitPairs.push(cells);
            const value = typeof clue.value === "string" ? Number(clue.value) : clue.value;
            constraints.push({ use, cells, ...(typeof value === "number" && Number.isFinite(value) && value > 0 ? { value } : {}) });
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
                warnings.push(`${use} marker with an unrecognized cell id was skipped`);
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
            warnings.push("littlekillersum with an unrecognized anchor cell or direction was skipped");
            continue;
        }
        const sum = typeof clue.value === "string" ? Number(clue.value) : clue.value;
        if (typeof sum !== "number" || !Number.isFinite(sum)) {
            warnings.push("littlekillersum without a numeric sum was skipped");
            continue;
        }
        constraints.push({ use: "killer", cells, sum, distinct: false });
    }

    for (const clue of (src.sandwichsum as FPuzzlesOutsideClue[] | undefined) ?? []) {
        const anchor = outsideCellCoords(clue.cell);
        const cells = anchor && sandwichCellsFromAnchor(anchor, size);
        if (!cells) {
            warnings.push("sandwichsum with an unrecognized anchor cell was skipped");
            continue;
        }
        const sum = typeof clue.value === "string" ? Number(clue.value) : clue.value;
        if (typeof sum !== "number" || !Number.isFinite(sum)) {
            warnings.push("sandwichsum without a numeric sum was skipped");
            continue;
        }
        constraints.push({ use: "sandwich", cells, sum });
    }

    for (const clue of (src.betweenline as FPuzzlesLinesClue[] | undefined) ?? []) {
        for (const line of clue.lines ?? []) {
            const cells = mapCells(line);
            if (!cells || cells.length < 3) {
                warnings.push("betweenline with an unrecognized cell id or too few cells was skipped");
                continue;
            }
            constraints.push({ use: "betweenline", cells });
        }
    }

    for (const clue of (src.palindrome as FPuzzlesLinesClue[] | undefined) ?? []) {
        for (const line of clue.lines ?? []) {
            const cells = mapCells(line);
            if (!cells || cells.length < 2) {
                warnings.push("palindrome line with an unrecognized cell id or too few cells was skipped");
                continue;
            }
            constraints.push({ use: "palindrome", cells });
        }
    }

    for (const clue of (src.clone as FPuzzlesCloneClue[] | undefined) ?? []) {
        const cells = mapCells(clue.cells);
        const cloneCells = mapCells(clue.cloneCells);
        if (!cells || !cloneCells || cells.length !== cloneCells.length) {
            warnings.push("clone with unrecognized or mismatched cells was skipped");
            continue;
        }
        constraints.push({ use: "clone", cells, cloneCells });
    }

    for (const clue of (src.quadruple as FPuzzlesQuadrupleClue[] | undefined) ?? []) {
        const cells = mapCells(clue.cells);
        if (!cells || !Array.isArray(clue.values) || clue.values.length === 0) {
            warnings.push("quadruple with unrecognized cells or no values was skipped");
            continue;
        }
        constraints.push({ use: "quadruple", cells, values: clue.values });
    }

    const explicitXVPairs: CellId[][] = [];
    for (const clue of (src.xv as FPuzzlesCellsClue[] | undefined) ?? []) {
        const cells = mapCells(clue.cells);
        const target = clue.value === "X" ? 10 : clue.value === "V" ? 5 : undefined;
        if (!cells || cells.length !== 2 || target === undefined) {
            warnings.push("xv marker with unrecognized cells or marker was skipped");
            continue;
        }
        explicitXVPairs.push(cells);
        constraints.push({ use: "xv", cells, target });
    }

    const negativeKindsSeen = new Set<"difference" | "ratio" | "xv">();
    for (const raw of (src.negative as unknown[] | undefined) ?? []) {
        if (typeof raw !== "string") {
            warnings.push(`"negative" entry ${JSON.stringify(raw)} was ignored (not a string)`);
            continue;
        }
        const kind = NEGATIVE_KIND_ALIASES[raw.toLowerCase()];
        if (!kind) {
            warnings.push(`"negative" entry "${raw}" is not a recognized kind and was ignored`);
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
            warnings.push("a hand-written primitive constraint cannot be represented in f-puzzles export; dropped");
            continue;
        }
        const { use, ...params } = spec;
        if (use === "sudoku") continue; // implied by the grid + regions above

        if (use === "killer") {
            if (params.distinct === false) {
                const cellsParam = params.cells as CellId[];
                const anchor = littleKillerAnchor(cellsParam);
                if (!anchor || typeof params.sum !== "number") {
                    warnings.push(
                        "littlekillersum with cells that aren't a straight diagonal, or missing sum, was skipped",
                    );
                    continue;
                }
                littlekillersumClues.push({ cell: anchor.cell, direction: anchor.direction, value: String(params.sum) });
                continue;
            }
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
        } else if (use === "minimum" || use === "maximum") {
            const raw = typeof params.cell === "string" ? params.cell : Array.isArray(params.cells) ? params.cells[0] : undefined;
            const cell = typeof raw === "string" ? toFPuzzlesCell(raw) : undefined;
            if (!cell) {
                warnings.push(`${use} marker with a non-grid cell id was skipped`);
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
                warnings.push("palindrome with a non-grid cell id was skipped");
                continue;
            }
            palindromeLines.push({ lines: [cells] });
        } else if (use === "clone") {
            const cells = exportCells(params.cells as CellId[]);
            const cloneCells = exportCells(params.cloneCells as CellId[]);
            if (!cells || !cloneCells) {
                warnings.push("clone with a non-grid cell id was skipped");
                continue;
            }
            cloneClues.push({ cells, cloneCells });
        } else if (use === "quadruple") {
            const cells = exportCells(params.cells as CellId[]);
            const values = Array.isArray(params.values) ? (params.values as number[]) : undefined;
            if (!cells || !values) {
                warnings.push("quadruple with a non-grid cell id or missing values was skipped");
                continue;
            }
            quadrupleClues.push({ cells, values });
        } else if (use === "xv") {
            const cells = exportCells(params.cells as CellId[]);
            const marker = params.target === 10 ? "X" : params.target === 5 ? "V" : undefined;
            if (!cells || !marker) {
                warnings.push("xv marker with a non-grid cell id or unrepresentable target was skipped");
                continue;
            }
            xvClues.push({ cells, value: marker });
        } else if (use === "sandwich") {
            const cellsParam = params.cells as CellId[];
            const anchor = sandwichAnchor(cellsParam, size);
            if (!anchor || typeof params.sum !== "number") {
                warnings.push("sandwich with cells that aren't a full row/column, or missing sum, was skipped");
                continue;
            }
            sandwichsumClues.push({ cell: anchor, value: String(params.sum) });
        } else if (use === "betweenline") {
            const cells = exportCells(params.cells as CellId[]);
            if (!cells) {
                warnings.push("betweenline with a non-grid cell id was skipped");
                continue;
            }
            betweenlineLines.push({ lines: [cells] });
        } else if (use === "negativeDifference" || use === "negativeRatio" || use === "negativeXV") {
            negativeKinds.add(use === "negativeDifference" ? "difference" : use === "negativeRatio" ? "ratio" : "xv");
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
            warnings.push("solution is incomplete; omitted from export");
        }
    }

    return { data, warnings };
};

/** The inverse of the share-link decoding in `importFPuzzles`: lz-string
 *  `compressToBase64`, dropped into the same `?load=` query param. */
export const encodeFPuzzlesShareLink = (data: FPuzzlesExport): string =>
    `https://f-puzzles.com/?load=${compressToBase64(JSON.stringify(data))}`;

/** SudokuPad reads the same f-puzzles JSON payload, lz-string-compressed the
 *  same way, but via its own URL scheme (`sudokupad.app/fpuzzles<data>`,
 *  payload appended directly to the path rather than a `?load=` query param)
 *  rather than round-tripping through f-puzzles.com. Unverified against the
 *  live site -- sudokupad.app isn't on this sandbox's network allowlist --
 *  so this should be sanity-checked against a real SudokuPad load before
 *  relying on it. */
export const encodeSudokuPadShareLink = (data: FPuzzlesExport): string =>
    `https://sudokupad.app/fpuzzles${compressToBase64(JSON.stringify(data))}`;
