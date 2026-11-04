/** The shapes of the f-puzzles JSON, and the cell and anchor helpers that import and export share. */

import { parseGridCellId, type CellId } from "@/runtime/geometry.ts";
import { type PuzzleDefinition } from "@/runtime/puzzle.ts";

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

export const toProjectCell = (cell: string): CellId | undefined => {
    const m = /^[Rr](\d+)[Cc](\d+)$/.exec(cell);
    if (!m) return undefined;
    return `r${m[1]}c${m[2]}`;
};

export const toFPuzzlesCell = (cell: CellId): string | undefined => {
    const m = /^r(\d+)c(\d+)$/.exec(cell);
    if (!m) return undefined;
    return `R${m[1]}C${m[2]}`;
};

export const mapCells = (ids: readonly string[]): CellId[] | undefined => {
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
export const outsideCellCoords = (cell: string): { row: number; col: number } | undefined => {
    const m = /^[Rr](\d+)[Cc](\d+)$/.exec(cell);
    if (!m) return undefined;
    return { row: Number(m[1]), col: Number(m[2]) };
};

export const DIAGONAL_DELTA: Record<"UL" | "UR" | "DL" | "DR", { dr: number; dc: number }> = {
    UL: { dr: -1, dc: -1 },
    UR: { dr: -1, dc: 1 },
    DL: { dr: 1, dc: -1 },
    DR: { dr: 1, dc: 1 },
};

/** Decode a sandwichsum anchor (just above/below a column, or left/right of a row)
 *  into the full row/column of cells that it sums. */
export const sandwichCellsFromAnchor = (anchor: { row: number; col: number }, size: number): CellId[] | undefined => {
    const rowInGrid = anchor.row >= 1 && anchor.row <= size;
    const colInGrid = anchor.col >= 1 && anchor.col <= size;
    if (rowInGrid && !colInGrid) return range(size).map((i) => `r${anchor.row}c${i + 1}`);
    if (colInGrid && !rowInGrid) return range(size).map((i) => `r${i + 1}c${anchor.col}`);
    return undefined;
};

/** Encode the full row/column of cells of a sandwich back into its anchor cell outside the grid. */
export const sandwichAnchor = (cells: readonly CellId[], size: number): string | undefined => {
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
export const littleKillerCellsFromAnchor = (
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
export const littleKillerAnchor = (
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

export const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
