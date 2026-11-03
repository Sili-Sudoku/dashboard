/**
 * Geometry describes the spatial structure of a puzzle.
 * It defines which cells exist, where they are in 2D space, which named regions group them,
 * and which cells are adjacent.
 *
 * The runtime uses only this interface.
 * A 9x9 Sudoku board is one `GridGeometry` instance.
 * The engine does not assume 9, a square, or even a grid.
 * A different geometry (hex, overlapping boards, a giant world) can implement the same surface.
 * It does not change the constraint evaluator, the session, or the renderer.
 */

export type CellId = string;

/** A point in geometry units (1 unit = 1 cell). The renderer scales it. */
export interface Point {
    x: number;
    y: number;
}

/** Axis-aligned bounds in geometry units. The renderer uses them to size a viewport. */
export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** One visible line of the board structure, in geometry units. */
export interface BoardLine {
    points: readonly Point[];
    /** True for region boundaries (box edges and outer border of a sudoku). False for plain cell dividers. */
    major: boolean;
}

export interface Geometry {
    /** All cells that can hold a value, in a stable order. */
    readonly cells: readonly CellId[];

    has(cell: CellId): boolean;

    /** The centre of a cell in geometry units. */
    center(cell: CellId): Point;

    /**
     * A named corner or anchor of a cell, for example "tl" | "tr" | "bl" | "br" | "c".
     * Visual objects use it to trace cell outlines.
     */
    anchor(cell: CellId, corner: CellCorner): Point;

    /** The orthogonal neighbours of a cell (cells that share an edge with it). */
    neighbors(cell: CellId): readonly CellId[];

    /** True if two cells share an edge. */
    adjacent(a: CellId, b: CellId): boolean;

    /**
     * Resolve a region selector to a list of cells.
     * Constraints use selectors to refer to groups. The engine does not need to know what a "box" is:
     *   "row:0" "col:8" "box:4"  -> groups that the geometry defines
     *   "all"                    -> every cell
     * An unknown selector returns `undefined`.
     * Then the caller can use the named regions of the puzzle.
     */
    resolveRegion(selector: string): readonly CellId[] | undefined;

    /** Names of the regions that the geometry defines (for tooling and debugging). */
    readonly regionSelectors: readonly string[];

    /** The total bounds in geometry units. */
    bounds(): Bounds;

    /**
     * The lines that give the board its structure: cell dividers and the heavier region boundaries.
     * The geometry owns them because only the geometry knows what its regions look like
     * (boxes on a grid, hexes on a hex board).
     * The renderer styles `major` lines and other lines differently and scales them to pixels.
     */
    boardLines(): readonly BoardLine[];

    /** One step in a direction, for keyboard navigation. Returns undefined at an edge. */
    step(cell: CellId, dir: Direction): CellId | undefined;
}

export type CellCorner = "tl" | "tr" | "bl" | "br" | "c";
export type Direction = "up" | "down" | "left" | "right";

export interface GridGeometrySpec {
    type: "grid";
    width: number;
    height: number;
    /** Box (region) size. If omitted, the default is sqrt(width) x sqrt(height). */
    boxWidth?: number;
    boxHeight?: number;
}

/** "row" | "col" | "box" for a selector such as `row:3` or, in a composite geometry, `g2/box:4`. */
export const regionKind = (selector: string): string =>
    selector.slice(selector.lastIndexOf("/") + 1).split(":")[0] ?? "";

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
     * False when the box size is a default (the spec does not give it) on a dimension that is not a perfect square.
     * Then there is no natural box subdivision.
     * If the default were the whole dimension, "box:0" would be the entire grid.
     * Its allDifferent would then be a guaranteed pigeonhole violation.
     * In that case the geometry emits no "box:" selectors, not one bad selector.
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

/**
 * Several independent grids in one shared coordinate space (linked and Samurai sudokus, boards with a gap).
 * Cells keep the plain `rNcM` names, but N and M count across the whole space, so a constraint can address
 * a cell without knowing its grid. Grids can overlap (a shared cell exists once) and can leave gaps.
 *
 * Each grid has its own regions, named `<grid id>/row:0`, `<grid id>/box:4`, and so on (`all` is every cell).
 * A definition such as `sudoku` walks the selectors, so it constrains each grid on its own.
 * A plain `row:0` does not exist here, because it is ambiguous.
 */
export interface CompositeGridSpec {
    /** Prefix of the region selectors of this grid. The default is `g1`, `g2`, and so on, by position. */
    id?: string;
    /** The position of the top-left cell of the grid in the shared space (0-based). */
    row: number;
    col: number;
    width: number;
    height: number;
    boxWidth?: number;
    boxHeight?: number;
}

export interface CompositeGeometrySpec {
    type: "composite";
    grids: readonly CompositeGridSpec[];
}

export type GeometrySpec = GridGeometrySpec | CompositeGeometrySpec;

/** "9×9" for a grid, "21×21, 5 grids" for a composite. */
export const describeGeometry = (spec: GeometrySpec): string =>
    spec.type === "grid"
        ? `${spec.width}×${spec.height}`
        : (() => {
              const { maxX, maxY } = new CompositeGeometry(spec).bounds();
              return `${maxX}×${maxY}, ${spec.grids.length} grids`;
          })();

const edgeKey = (horizontal: boolean, fixed: number, at: number) => `${horizontal ? "h" : "v"}:${fixed}:${at}`;

export class CompositeGeometry implements Geometry {
    readonly cells: readonly CellId[];
    readonly regionSelectors: readonly string[];

    private readonly cellSet: Set<CellId>;
    private readonly regions = new Map<string, readonly CellId[]>();
    private readonly majorEdges = new Map<string, boolean>();
    private readonly extent: Bounds;

    constructor(spec: CompositeGeometrySpec) {
        // Data from outside can break the type, so check it. The flag keeps `spec.grids` typed as it is declared.
        const hasGrids = Array.isArray(spec.grids) && spec.grids.length > 0;
        if (!hasGrids) {
            throw new Error("a composite geometry needs at least one grid");
        }
        const present = new Set<CellId>();
        const selectors: string[] = ["all"];
        const ids = new Set<string>();

        spec.grids.forEach((g, i) => {
            const id = g.id ?? `g${i + 1}`;
            if (id === "" || /[:/]/.test(id))
                throw new Error(`grid id "${id}" must be non-empty and contain no ":" or "/"`);
            if (ids.has(id)) throw new Error(`two grids have the same id "${id}"`);
            ids.add(id);
            if (!Number.isInteger(g.row) || g.row < 0 || !Number.isInteger(g.col) || g.col < 0) {
                throw new Error(`grid "${id}": row and col must be non-negative integers`);
            }
            // A plain GridGeometry does the tiling of the grid (boxes, defaults, validation). This code only moves it.
            const local = new GridGeometry({ type: "grid", ...g });
            const move = (cell: CellId): CellId => {
                const rc = parseGridCellId(cell) as { row: number; col: number };
                return GridCellId(rc.row + g.row, rc.col + g.col);
            };
            for (const cell of local.cells) present.add(move(cell));
            for (const sel of local.regionSelectors) {
                if (sel === "all") continue;
                const name = `${id}/${sel}`;
                selectors.push(name);
                this.regions.set(name, (local.resolveRegion(sel) as readonly CellId[]).map(move));
            }
            for (const line of local.boardLines()) {
                const [a, b] = line.points as [Point, Point];
                const horizontal = a.y === b.y;
                const fixed = (horizontal ? a.y : a.x) + (horizontal ? g.row : g.col);
                const from = (horizontal ? a.x : a.y) + (horizontal ? g.col : g.row);
                const to = (horizontal ? b.x : b.y) + (horizontal ? g.col : g.row);
                for (let at = from; at < to; at++) {
                    const key = edgeKey(horizontal, fixed, at);
                    this.majorEdges.set(key, (this.majorEdges.get(key) ?? false) || line.major);
                }
            }
        });

        // Row-major over the whole space. So the order is stable in any order of the grid list.
        this.cells = [...present].sort((a, b) => {
            const pa = parseGridCellId(a) as { row: number; col: number };
            const pb = parseGridCellId(b) as { row: number; col: number };
            return pa.row - pb.row || pa.col - pb.col;
        });
        this.cellSet = present;
        this.regions.set("all", this.cells);
        this.regionSelectors = selectors;

        let [minX, minY, maxX, maxY] = [Infinity, Infinity, 0, 0];
        for (const cell of this.cells) {
            const { row, col } = parseGridCellId(cell) as { row: number; col: number };
            minX = Math.min(minX, col);
            minY = Math.min(minY, row);
            maxX = Math.max(maxX, col + 1);
            maxY = Math.max(maxY, row + 1);
        }
        this.extent = { minX, minY, maxX, maxY };
    }

    has(cell: CellId): boolean {
        return this.cellSet.has(cell);
    }

    private require(cell: CellId): { row: number; col: number } {
        const rc = parseGridCellId(cell);
        if (!rc || !this.cellSet.has(cell)) throw new Error(`cell ${cell} is not part of this geometry`);
        return rc;
    }

    center(cell: CellId): Point {
        const { row, col } = this.require(cell);
        return { x: col + 0.5, y: row + 0.5 };
    }

    anchor(cell: CellId, corner: CellCorner): Point {
        const { row, col } = this.require(cell);
        const dx = corner === "tr" || corner === "br" ? 1 : corner === "c" ? 0.5 : 0;
        const dy = corner === "bl" || corner === "br" ? 1 : corner === "c" ? 0.5 : 0;
        return { x: col + dx, y: row + dy };
    }

    neighbors(cell: CellId): readonly CellId[] {
        const { row, col } = this.require(cell);
        return Object.values(DIR_DELTA)
            .map(({ dr, dc }) => GridCellId(row + dr, col + dc))
            .filter((c) => this.cellSet.has(c));
    }

    adjacent(a: CellId, b: CellId): boolean {
        const pa = this.require(a);
        const pb = this.require(b);
        return Math.abs(pa.row - pb.row) + Math.abs(pa.col - pb.col) === 1;
    }

    resolveRegion(selector: string): readonly CellId[] | undefined {
        return this.regions.get(selector);
    }

    bounds(): Bounds {
        return this.extent;
    }

    /** The lines of every grid in the shared space. A shared edge appears once (heavy if any grid says so).
     *  Collinear runs are joined. */
    boardLines(): readonly BoardLine[] {
        const runs = new Map<string, { horizontal: boolean; fixed: number; major: boolean; at: number[] }>();
        for (const [key, major] of this.majorEdges) {
            const [kind, fixedRaw, atRaw] = key.split(":") as [string, string, string];
            const run = `${kind}:${fixedRaw}:${major}`;
            const entry = runs.get(run) ?? { horizontal: kind === "h", fixed: Number(fixedRaw), major, at: [] };
            entry.at.push(Number(atRaw));
            runs.set(run, entry);
        }
        const lines: BoardLine[] = [];
        for (const { horizontal, fixed, major, at } of runs.values()) {
            at.sort((x, y) => x - y);
            let start = at[0];
            for (let i = 0; i < at.length; i++) {
                const last = at[i];
                if (i + 1 < at.length && at[i + 1] === last + 1) continue;
                const [p, q] = horizontal
                    ? [
                          { x: start, y: fixed },
                          { x: last + 1, y: fixed },
                      ]
                    : [
                          { x: fixed, y: start },
                          { x: fixed, y: last + 1 },
                      ];
                lines.push({ points: [p, q], major });
                start = at[i + 1];
            }
        }
        return lines;
    }

    /** Steps across a gap between grids. So the keyboard can go from one board to the next. */
    step(cell: CellId, dir: Direction): CellId | undefined {
        const { row, col } = this.require(cell);
        const { dr, dc } = DIR_DELTA[dir];
        const { minX, minY, maxX, maxY } = this.extent;
        for (let r = row + dr, c = col + dc; r >= minY && r < maxY && c >= minX && c < maxX; r += dr, c += dc) {
            const next = GridCellId(r, c);
            if (this.cellSet.has(next)) return next;
        }
        return undefined;
    }
}

export const createGeometry = (spec: GeometrySpec): Geometry => {
    switch (spec.type) {
        case "grid":
            return new GridGeometry(spec);
        case "composite":
            return new CompositeGeometry(spec);
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
