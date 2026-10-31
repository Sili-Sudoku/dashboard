/**
 * Geometry describes the spatial structure a puzzle lives in: which cells exist,
 * where they sit in 2D space, how they are grouped into named regions, and which
 * cells are adjacent.
 *
 * The runtime only ever talks to this interface. A 9x9 Sudoku board is one
 * `GridGeometry` instance; nothing in the engine assumes 9, or a square, or even
 * a grid. A different geometry (hex, overlapping boards, a giant world) would
 * implement the same surface without touching the constraint evaluator, the
 * session, or the renderer.
 */

export type CellId = string;

/** A point in geometry units (1 unit == 1 cell). The renderer scales this. */
export interface Point {
    x: number;
    y: number;
}

/** Axis-aligned bounds in geometry units, used to size a viewport. */
export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** One line of the board's visible structure, in geometry units. */
export interface BoardLine {
    points: readonly Point[];
    /** True for region boundaries (a sudoku's box edges and outer border); false for plain cell dividers. */
    major: boolean;
}

export interface Geometry {
    /** Every cell that can hold a value, in a stable order. */
    readonly cells: readonly CellId[];

    has(cell: CellId): boolean;

    /** Centre of a cell in geometry units. */
    center(cell: CellId): Point;

    /**
     * A named corner/anchor of a cell, e.g. "tl" | "tr" | "bl" | "br" | "c".
     * Used by visual objects that need to trace cell outlines.
     */
    anchor(cell: CellId, corner: CellCorner): Point;

    /** Orthogonally-adjacent (edge-sharing) neighbours of a cell. */
    neighbors(cell: CellId): readonly CellId[];

    /** True if two cells share an edge. */
    adjacent(a: CellId, b: CellId): boolean;

    /**
     * Resolve a region selector to a concrete cell list. Selectors are how
     * constraints refer to groups without the engine knowing what a "box" is:
     *   "row:0" "col:8" "box:4"  -> geometry-defined groups
     *   "all"                    -> every cell
     * Unknown selectors return `undefined` so callers can fall back to
     * puzzle-defined named regions.
     */
    resolveRegion(selector: string): readonly CellId[] | undefined;

    /** Names of the geometry-defined regions (for tooling / debugging). */
    readonly regionSelectors: readonly string[];

    /** Overall bounds in geometry units. */
    bounds(): Bounds;

    /**
     * The lines that give the board its structure: cell dividers plus the
     * heavier region boundaries. Owned by the geometry because only it knows
     * what its regions look like (boxes on a grid, hexes on a hex board) — the
     * renderer just styles `major` vs not and scales to pixels.
     */
    boardLines(): readonly BoardLine[];

    /** Direction stepping for keyboard navigation. Returns undefined at edges. */
    step(cell: CellId, dir: Direction): CellId | undefined;
}

export type CellCorner = "tl" | "tr" | "bl" | "br" | "c";
export type Direction = "up" | "down" | "left" | "right";

export interface GridGeometrySpec {
    type: "grid";
    width: number;
    height: number;
    /** Box (region) size. Defaults to sqrt(width) x sqrt(height) when omitted. */
    boxWidth?: number;
    boxHeight?: number;
}

export const GridCellId = (row: number, col: number): CellId => `r${row + 1}c${col + 1}`;

const CELL_RE = /^r(\d+)c(\d+)$/;

export const parseGridCellId = (cell: CellId): { row: number; col: number } | undefined => {
    const m = CELL_RE.exec(cell);
    if (!m) return undefined;
    return { row: Number(m[1]) - 1, col: Number(m[2]) - 1 };
};

const DIR_DELTA: Record<Direction, { dr: number; dc: number }> = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 },
};

export class GridGeometry implements Geometry {
    readonly width: number;
    readonly height: number;
    readonly boxWidth: number;
    readonly boxHeight: number;

    readonly cells: readonly CellId[];
    readonly regionSelectors: readonly string[];

    /**
     * False when a box size had to be defaulted (not given in the spec) on a
     * dimension that isn't a perfect square: there is no natural box subdivision
     * then, and defaulting to the whole dimension would make "box:0" the entire
     * grid, turning its allDifferent into a pigeonhole-guaranteed violation. In
     * that case no "box:" selectors are emitted at all, rather than one bad one.
     */
    private readonly boxesEnabled: boolean;

    private readonly cellSet: Set<CellId>;

    constructor(spec: GridGeometrySpec) {
        if (!Number.isInteger(spec.width) || spec.width <= 0) {
            throw new Error(`grid width must be a positive integer, got ${spec.width}`);
        }
        if (!Number.isInteger(spec.height) || spec.height <= 0) {
            throw new Error(`grid height must be a positive integer, got ${spec.height}`);
        }

        this.width = spec.width;
        this.height = spec.height;
        const widthHasDefaultBox = spec.boxWidth !== undefined || isPerfectSquare(spec.width);
        const heightHasDefaultBox = spec.boxHeight !== undefined || isPerfectSquare(spec.height);
        this.boxWidth = spec.boxWidth ?? defaultBox(spec.width);
        this.boxHeight = spec.boxHeight ?? defaultBox(spec.height);
        this.boxesEnabled = widthHasDefaultBox && heightHasDefaultBox;

        const cells: CellId[] = [];
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                cells.push(GridCellId(row, col));
            }
        }
        this.cells = cells;
        this.cellSet = new Set(cells);

        const selectors: string[] = ["all"];
        for (let r = 0; r < this.height; r++) selectors.push(`row:${r}`);
        for (let c = 0; c < this.width; c++) selectors.push(`col:${c}`);
        if (this.boxesEnabled) {
            const boxesAcross = Math.ceil(this.width / this.boxWidth);
            const boxesDown = Math.ceil(this.height / this.boxHeight);
            const boxCount = boxesAcross * boxesDown;
            for (let b = 0; b < boxCount; b++) selectors.push(`box:${b}`);
        }
        this.regionSelectors = selectors;
    }

    has(cell: CellId): boolean {
        return this.cellSet.has(cell);
    }

    private require(cell: CellId): { row: number; col: number } {
        const rc = parseGridCellId(cell);
        if (!rc || !this.cellSet.has(cell)) {
            throw new Error(`cell ${cell} is not part of this geometry`);
        }
        return rc;
    }

    center(cell: CellId): Point {
        const { row, col } = this.require(cell);
        return { x: col + 0.5, y: row + 0.5 };
    }

    anchor(cell: CellId, corner: CellCorner): Point {
        const { row, col } = this.require(cell);
        switch (corner) {
            case "tl":
                return { x: col, y: row };
            case "tr":
                return { x: col + 1, y: row };
            case "bl":
                return { x: col, y: row + 1 };
            case "br":
                return { x: col + 1, y: row + 1 };
            case "c":
                return { x: col + 0.5, y: row + 0.5 };
        }
    }

    neighbors(cell: CellId): readonly CellId[] {
        const { row, col } = this.require(cell);
        const out: CellId[] = [];
        for (const { dr, dc } of Object.values(DIR_DELTA)) {
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < this.height && nc >= 0 && nc < this.width) {
                out.push(GridCellId(nr, nc));
            }
        }
        return out;
    }

    adjacent(a: CellId, b: CellId): boolean {
        const pa = this.require(a);
        const pb = this.require(b);
        return Math.abs(pa.row - pb.row) + Math.abs(pa.col - pb.col) === 1;
    }

    resolveRegion(selector: string): readonly CellId[] | undefined {
        if (selector === "all") return this.cells;

        const [kind, rawIndex] = selector.split(":");
        const index = Number(rawIndex);
        if (!Number.isInteger(index) || index < 0) return undefined;

        if (kind === "row") {
            if (index >= this.height) return undefined;
            return range(this.width).map((col) => GridCellId(index, col));
        }
        if (kind === "col") {
            if (index >= this.width) return undefined;
            return range(this.height).map((row) => GridCellId(row, index));
        }
        if (kind === "box") {
            if (!this.boxesEnabled) return undefined;
            const boxesAcross = Math.ceil(this.width / this.boxWidth);
            const boxesDown = Math.ceil(this.height / this.boxHeight);
            if (index >= boxesAcross * boxesDown) return undefined;
            const boxRow = Math.floor(index / boxesAcross);
            const boxCol = index % boxesAcross;
            const out: CellId[] = [];
            for (let r = 0; r < this.boxHeight; r++) {
                for (let c = 0; c < this.boxWidth; c++) {
                    const row = boxRow * this.boxHeight + r;
                    const col = boxCol * this.boxWidth + c;
                    if (row < this.height && col < this.width) {
                        out.push(GridCellId(row, col));
                    }
                }
            }
            return out;
        }
        return undefined;
    }

    bounds(): Bounds {
        return { minX: 0, minY: 0, maxX: this.width, maxY: this.height };
    }

    boardLines(): readonly BoardLine[] {
        const lines: BoardLine[] = [];
        for (let x = 0; x <= this.width; x++) {
            lines.push({
                points: [
                    { x, y: 0 },
                    { x, y: this.height },
                ],
                major: x % this.boxWidth === 0,
            });
        }
        for (let y = 0; y <= this.height; y++) {
            lines.push({
                points: [
                    { x: 0, y },
                    { x: this.width, y },
                ],
                major: y % this.boxHeight === 0,
            });
        }
        return lines;
    }

    step(cell: CellId, dir: Direction): CellId | undefined {
        const { row, col } = this.require(cell);
        const { dr, dc } = DIR_DELTA[dir];
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= this.height || nc < 0 || nc >= this.width) return undefined;
        return GridCellId(nr, nc);
    }
}

export const createGeometry = (spec: GridGeometrySpec): Geometry => {
    switch (spec.type) {
        case "grid":
            return new GridGeometry(spec);
        default:
            throw new Error(`unknown geometry type: ${(spec as { type: string }).type}`);
    }
};

const isPerfectSquare = (n: number): boolean => {
    const root = Math.round(Math.sqrt(n));
    return root * root === n;
};

const defaultBox = (n: number): number => {
    const root = Math.round(Math.sqrt(n));
    return root * root === n ? root : n;
};

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
