/**
 * Pure geometry for the renderer: convert a puzzle's generic visual objects and
 * board state into flat lists of drawable shapes in absolute pixel coordinates.
 *
 * The renderer component (`Board.tsx`) is a thin mapping from these shapes to
 * SVG elements. Nothing here — or there — knows what a thermometer is; it knows
 * "path", "circle", "line", "cage" (an outline around a cell set), and so on.
 */

import type { Bounds, CellId, Geometry, Point } from "@/runtime/geometry.ts";
import { createGeometry } from "@/runtime/geometry.ts";
import type { CompiledPuzzle, PointRef, VisualObject, VisualStyle } from "@/runtime/puzzle.ts";
import type { EvaluationResult } from "@/runtime/evaluate.ts";

export interface SceneInput {
    puzzle: CompiledPuzzle;
    valueOf: (cell: CellId) => number | null;
    notesOf: (cell: CellId) => readonly number[];
    isGiven: (cell: CellId) => boolean;
    selection: ReadonlySet<CellId>;
    cursor: CellId | null;
    evaluation: EvaluationResult;
}

export type CellTone = "normal" | "violated" | "invalid";

/** Which selection ring (if any) to draw on top of the tone fill. */
export type SelectionRing = "selected" | "cursor" | null;

export interface CellShape {
    cell: CellId;
    x: number;
    y: number;
    size: number;
    tone: CellTone;
    ring: SelectionRing;
    value: number | null;
    given: boolean;
    notes: readonly number[];
}

export type Shape =
    | { kind: "polyline"; points: Point[]; style: ResolvedStyle; rounded: boolean }
    | { kind: "polygon"; points: Point[]; style: ResolvedStyle }
    | { kind: "circle"; cx: number; cy: number; r: number; style: ResolvedStyle }
    | { kind: "rect"; x: number; y: number; w: number; h: number; style: ResolvedStyle }
    | { kind: "text"; x: number; y: number; text: string; fontSize: number; style: ResolvedStyle }
    | { kind: "arrowhead"; at: Point; angle: number; size: number; style: ResolvedStyle }
    | { kind: "cage"; segments: [Point, Point][]; label?: { x: number; y: number; text: string }; style: ResolvedStyle };

export interface ResolvedStyle {
    stroke: string;
    fill: string;
    strokeWidth: number;
    dashed: boolean;
    opacity: number;
    z: number;
}

export interface Scene {
    width: number;
    height: number;
    viewBox: string;
    cellSize: number;
    cells: CellShape[];
    /** Thick lines between boxes / around the board. */
    gridLines: { points: Point[]; weight: number }[];
    /** Visual objects (constraint graphics), sorted by z. */
    shapes: Shape[];
}

const DEFAULT_CELL_SIZE = 64;

export const buildScene = (input: SceneInput): Scene => {
    const geometry = createGeometry(input.puzzle.geometry);
    const cellSize = input.puzzle.presentation.cellSize ?? DEFAULT_CELL_SIZE;
    const b = geometry.bounds();
    const width = (b.maxX - b.minX) * cellSize;
    const height = (b.maxY - b.minY) * cellSize;

    const selected = input.selection;
    const violated = input.evaluation.violatedCells;
    const invalid = input.evaluation.invalidCells;

    const cells: CellShape[] = geometry.cells.map((cell) => {
        const p = geometry.anchor(cell, "tl");
        return {
            cell,
            x: p.x * cellSize,
            y: p.y * cellSize,
            size: cellSize,
            tone: tone(cell, violated, invalid),
            ring: ring(cell, input.cursor, selected),
            value: input.valueOf(cell),
            given: input.isGiven(cell),
            notes: input.notesOf(cell),
        };
    });

    const shapes = [...input.puzzle.objects]
        .flatMap((obj) => describeObject(obj, geometry, cellSize))
        .sort((a, b2) => a.style.z - b2.style.z);

    return {
        width,
        height,
        viewBox: `0 0 ${width} ${height}`,
        cellSize,
        cells,
        gridLines: gridLines(geometry, cellSize, b),
        shapes,
    };
};

const tone = (cell: CellId, violated: ReadonlySet<CellId>, invalid: ReadonlySet<CellId>): CellTone => {
    if (invalid.has(cell)) return "invalid";
    if (violated.has(cell)) return "violated";
    return "normal";
};

/**
 * Selection/cursor is drawn as a ring layered on top of the tone fill (see
 * Board.tsx) rather than competing with it for the same fill color — so a
 * violated/invalid cell still visibly reacts to being selected or cursored.
 */
const ring = (cell: CellId, cursor: CellId | null, selected: ReadonlySet<CellId>): SelectionRing => {
    if (cell === cursor) return "cursor";
    if (selected.has(cell)) return "selected";
    return null;
};

export const resolveStyle = (style: VisualStyle | undefined, fallback: Partial<ResolvedStyle> = {}): ResolvedStyle => ({
    stroke: style?.stroke ?? fallback.stroke ?? "var(--ink)",
    fill: style?.fill ?? fallback.fill ?? "none",
    strokeWidth: style?.strokeWidth ?? fallback.strokeWidth ?? 0.06,
    dashed: style?.dashed ?? fallback.dashed ?? false,
    opacity: style?.opacity ?? fallback.opacity ?? 1,
    z: style?.z ?? fallback.z ?? 0,
});

export const resolvePointRef = (ref: PointRef, geometry: Geometry): Point => {
    if (typeof ref === "string") return geometry.center(ref);
    if ("cell" in ref) return geometry.anchor(ref.cell, ref.corner);
    return { x: ref.x, y: ref.y };
};

const scalePoint = (p: Point, cellSize: number): Point => ({ x: p.x * cellSize, y: p.y * cellSize });

const scaleStyle = (style: ResolvedStyle, cellSize: number): ResolvedStyle => ({
    ...style,
    strokeWidth: style.strokeWidth * cellSize,
});

/** Turn one generic visual object into 1..n absolute-pixel shapes. */
export const describeObject = (obj: VisualObject, geometry: Geometry, cellSize: number): Shape[] => {
    const style = scaleStyle(resolveStyle(obj.style), cellSize);

    switch (obj.kind) {
        case "path": {
            const points = obj.cells.map((c) => scalePoint(geometry.center(c), cellSize));
            return [{ kind: "polyline", points, style, rounded: true }];
        }
        case "line": {
            const pts = obj.points.map((r) => scalePoint(resolvePointRef(r, geometry), cellSize));
            const shapes: Shape[] = [{ kind: "polyline", points: pts, style, rounded: false }];
            if (obj.arrow && pts.length >= 2) {
                const tip = pts[pts.length - 1];
                const prev = pts[pts.length - 2];
                shapes.push({
                    kind: "arrowhead",
                    at: tip,
                    angle: Math.atan2(tip.y - prev.y, tip.x - prev.x),
                    size: cellSize * 0.22,
                    style,
                });
            }
            return shapes;
        }
        case "polygon": {
            const points = obj.points.map((r) => scalePoint(resolvePointRef(r, geometry), cellSize));
            return [{ kind: "polygon", points, style }];
        }
        case "circle": {
            const c = scalePoint(resolvePointRef(obj.at, geometry), cellSize);
            return [{ kind: "circle", cx: c.x, cy: c.y, r: obj.r * cellSize, style }];
        }
        case "rect": {
            const p = scalePoint(resolvePointRef(obj.at, geometry), cellSize);
            return [{ kind: "rect", x: p.x, y: p.y, w: obj.w * cellSize, h: obj.h * cellSize, style }];
        }
        case "text": {
            const p = scalePoint(resolvePointRef(obj.at, geometry), cellSize);
            const fontSize = (obj.style?.fontSize ?? 0.3) * cellSize;
            return [{ kind: "text", x: p.x, y: p.y, text: obj.text, fontSize, style }];
        }
        case "region": {
            return obj.cells.map((cell) => {
                const p = scalePoint(geometry.anchor(cell, "tl"), cellSize);
                return { kind: "rect", x: p.x, y: p.y, w: cellSize, h: cellSize, style };
            });
        }
        case "cage": {
            const segments = cageOutline(obj.cells, geometry).map(
                ([a, z]) => [scalePoint(a, cellSize), scalePoint(z, cellSize)] as [Point, Point],
            );
            const anchor = cageLabelAnchor(obj.cells, geometry);
            return [
                {
                    kind: "cage",
                    segments,
                    label:
                        obj.label && anchor
                            ? { x: anchor.x * cellSize, y: anchor.y * cellSize, text: obj.label }
                            : undefined,
                    style,
                },
            ];
        }
    }
};

const INSET = 0.08;

/**
 * The dashed outline of a set of cells: for every cell edge that faces a cell
 * *outside* the set, emit an inset segment. Generic to any geometry that reports
 * cell corners.
 */
export const cageOutline = (cells: readonly CellId[], geometry: Geometry): [Point, Point][] => {
    const set = new Set(cells);
    const segments: [Point, Point][] = [];

    for (const cell of cells) {
        const tl = geometry.anchor(cell, "tl");
        const tr = geometry.anchor(cell, "tr");
        const bl = geometry.anchor(cell, "bl");
        const br = geometry.anchor(cell, "br");

        const up = geometry.step(cell, "up");
        const down = geometry.step(cell, "down");
        const left = geometry.step(cell, "left");
        const right = geometry.step(cell, "right");

        if (!up || !set.has(up)) segments.push([inset(tl, 0, INSET), inset(tr, 0, INSET)]);
        if (!down || !set.has(down)) segments.push([inset(bl, 0, -INSET), inset(br, 0, -INSET)]);
        if (!left || !set.has(left)) segments.push([inset(tl, INSET, 0), inset(bl, INSET, 0)]);
        if (!right || !set.has(right)) segments.push([inset(tr, -INSET, 0), inset(br, -INSET, 0)]);
    }
    return segments;
};

const inset = (p: Point, dx: number, dy: number): Point => ({ x: p.x + dx, y: p.y + dy });

const cageLabelAnchor = (cells: readonly CellId[], geometry: Geometry): Point | undefined => {
    let best: { cell: CellId; p: Point } | undefined;
    for (const cell of cells) {
        const p = geometry.anchor(cell, "tl");
        if (!best || p.y < best.p.y || (p.y === best.p.y && p.x < best.p.x)) best = { cell, p };
    }
    return best ? { x: best.p.x + INSET + 0.02, y: best.p.y + INSET + 0.18 } : undefined;
};

const gridLines = (
    geometry: Geometry,
    cellSize: number,
    bounds: Bounds,
): { points: Point[]; weight: number }[] => {
    const lines: { points: Point[]; weight: number }[] = [];
    // Only grid geometry exposes box structure; fall back to an outer border otherwise.
    const grid = geometry as Geometry & { width?: number; height?: number; boxWidth?: number; boxHeight?: number };
    const w = grid.width ?? bounds.maxX;
    const h = grid.height ?? bounds.maxY;
    const bw = grid.boxWidth ?? w;
    const bh = grid.boxHeight ?? h;

    for (let x = 0; x <= w; x++) {
        lines.push({
            points: [
                { x: x * cellSize, y: 0 },
                { x: x * cellSize, y: h * cellSize },
            ],
            weight: x % bw === 0 ? 3 : 1,
        });
    }
    for (let y = 0; y <= h; y++) {
        lines.push({
            points: [
                { x: 0, y: y * cellSize },
                { x: w * cellSize, y: y * cellSize },
            ],
            weight: y % bh === 0 ? 3 : 1,
        });
    }
    return lines;
};
