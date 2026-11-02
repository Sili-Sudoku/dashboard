/**
 * Pure geometry for the renderer: convert a puzzle's generic visual objects and
 * board state into flat lists of drawable shapes in absolute pixel coordinates.
 *
 * The renderer component (`Board.tsx`) is a thin mapping from these shapes to
 * SVG elements. Nothing here — or there — knows what a thermometer is; it knows
 * "path", "circle", "line", "cage" (an outline around a cell set), and so on.
 */

import type { CellId, Geometry, Point } from "@/runtime/geometry.ts";
import { createGeometry } from "@/runtime/geometry.ts";
import type { CompiledPuzzle, PointRef, VisualObject, VisualStyle } from "@/runtime/puzzle.ts";
import type { EvaluationResult } from "@/runtime/evaluate.ts";
import { MARK_COLOR_COUNT, resolveMarkColor } from "@/runtime/mark_colors.ts";
import { parsePointKey, parseSegmentKey, type PenState } from "@/runtime/pen.ts";

export interface SceneInput {
    puzzle: CompiledPuzzle;
    /**
     * Expected to already be fog-aware (see `PuzzleSession.displayState`):
     * for a hidden given, this must be the player's own entry, if any — not
     * the given's real value — since this module makes no further attempt
     * to mask it.
     */
    valueOf: (cell: CellId) => number | null;
    notesOf: (cell: CellId) => readonly number[];
    centerNotesOf: (cell: CellId) => readonly number[];
    /** Cells flagged by PuzzleSession.checkNotesOnLeave/checkAgainstSolution (a bad note elimination). */
    flaggedCells: ReadonlySet<CellId>;
    /** Cells flagged by PuzzleSession.checkAgainstSolution as holding a value that doesn't match the solution. */
    incorrectCells: ReadonlySet<CellId>;
    /** Structural given-ness, independent of fog — `buildScene` combines it with `hiddenCells` itself. */
    isGiven: (cell: CellId) => boolean;
    selection: ReadonlySet<CellId>;
    cursor: CellId | null;
    evaluation: EvaluationResult;
    /** Cells still hidden by fog — see `runtime/fog.ts`. */
    hiddenCells: ReadonlySet<CellId>;
    /** Compiled constraint ids (see `compile.ts`'s `solutionViolations`) to draw
     *  in red instead of their normal style — e.g. the Author page's visual
     *  builder, showing a constraint that conflicts with the puzzle's own
     *  declared solution rather than hiding it entirely. */
    invalidConstraintIds?: ReadonlySet<string>;
    /** Flag every other cell showing the same value as the cursor cell (#73) —
     *  purely visual; doesn't touch the real selection or cursor. */
    highlightSameValue?: boolean;
    /** Colour marks per cell, as palette indices (#35), resolved against `markPalette`. */
    colorsOf?: (cell: CellId) => readonly number[];
    markPalette?: readonly string[];
    /** The player's pen layer (#45): freehand lines and X/O marks, drawn over the digits. */
    pen?: PenState;
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
    centerNotes: readonly number[];
    /** Flagged by checkNotesOnLeave/checkAgainstSolution — remaining notes no longer include the solution digit. */
    flagged: boolean;
    /** Flagged by checkAgainstSolution — the placed value doesn't match the solution. */
    incorrect: boolean;
    /** Still hidden by fog — the renderer paints over it rather than leaking what's underneath. */
    hidden: boolean;
    /** Shows the same value as the cursor cell (#73) — a passive highlight, separate from tone and ring. */
    sameValue: boolean;
    /** Colour marks in palette order: the digit that picks each (1-9, 0 = background) and its resolved colour. */
    marks: readonly { position: number; color: string }[];
}

export type Shape =
    | { kind: "polyline"; points: Point[]; style: ResolvedStyle; rounded: boolean }
    | { kind: "polygon"; points: Point[]; style: ResolvedStyle }
    | { kind: "circle"; cx: number; cy: number; r: number; style: ResolvedStyle }
    | { kind: "rect"; x: number; y: number; w: number; h: number; style: ResolvedStyle }
    | { kind: "text"; x: number; y: number; text: string; fontSize: number; bold?: boolean; style: ResolvedStyle }
    | { kind: "arrowhead"; at: Point; angle: number; size: number; style: ResolvedStyle }
    | {
          kind: "cage";
          segments: [Point, Point][];
          label?: { x: number; y: number; text: string };
          style: ResolvedStyle;
      };

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
    /** One combined outline around the multi-cell selection (#157), in board pixels. */
    selectionOutline: [Point, Point][];
    /** Where the grid's top-left corner sits in the scene (the margin reserved for outside clues). */
    origin: Point;
    /** The pen layer (#45) as shapes, drawn above everything else. */
    pen: Shape[];
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

    // The cursor cell's visible value (null while empty or fog-hidden, so a
    // hidden cell can't be used to reveal where its digit appears).
    const sameAs = input.highlightSameValue && input.cursor ? input.valueOf(input.cursor) : null;

    const cells: CellShape[] = geometry.cells.map((cell) => {
        const p = geometry.anchor(cell, "tl");
        const hidden = input.hiddenCells.has(cell);
        return {
            cell,
            x: p.x * cellSize,
            y: p.y * cellSize,
            size: cellSize,
            tone: tone(cell, violated, invalid),
            ring: ring(cell, input.cursor, selected),
            // `valueOf`/`notesOf`/etc. are expected to already be fog-aware
            // (see PuzzleSession.displayState): a hidden given's *mystery*
            // value isn't passed through at all, only the player's own entry
            // underneath it, if any — so there's nothing left to mask here.
            value: input.valueOf(cell),
            // Only draw given-digit styling once the given is actually shown
            // as one — while it's still hidden, any value here is the
            // player's own (non-authoritative) guess, not the clue.
            given: input.isGiven(cell) && !hidden,
            notes: input.notesOf(cell),
            centerNotes: input.centerNotesOf(cell),
            flagged: input.flaggedCells.has(cell),
            incorrect: input.incorrectCells.has(cell),
            hidden,
            marks: (input.colorsOf?.(cell) ?? []).flatMap((i) => {
                const color = resolveMarkColor(input.markPalette ?? [], i);
                // position = the digit that picks it: 1-9, and 0 for the background mark.
                return color ? [{ position: (i + 1) % MARK_COLOR_COUNT, color }] : [];
            }),
            sameValue: sameAs !== null && cell !== input.cursor && !hidden && input.valueOf(cell) === sameAs,
        };
    });

    const invalidIds = input.invalidConstraintIds;
    const shapes = [...input.puzzle.objects]
        .flatMap((obj) => {
            const shapes = describeObject(obj, geometry, cellSize);
            const invalid = invalidIds && obj.id?.split(",").some((id) => invalidIds.has(id));
            return invalid ? shapes.map(markInvalid) : shapes;
        })
        .sort((a, b2) => a.style.z - b2.style.z);

    // Content a definition places outside the grid (sandwich/X-sum/room clues, #130) gets a
    // margin on whichever sides it overhangs, so it isn't clipped by the viewBox; everything
    // is then shifted right/down by the left/top margin so the scene stays origin-anchored
    // at 0,0 (which pan/zoom, culling and the thumbnail all rely on).
    const margin = overhang(shapes, width, height);
    const scene: Scene = {
        width: width + margin.left + margin.right,
        height: height + margin.top + margin.bottom,
        viewBox: `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`,
        cellSize,
        cells,
        gridLines: gridLines(geometry, cellSize),
        shapes,
        selectionOutline: selectionOutline(selected, input.cursor, geometry, cellSize),
        origin: { x: 0, y: 0 },
        pen: [],
    };
    const placed = margin.left === 0 && margin.top === 0 ? scene : translateScene(scene, margin.left, margin.top);
    const origin = { x: margin.left, y: margin.top };
    return { ...placed, origin, pen: input.pen ? penShapes(input.pen, origin, cellSize) : [] };
};

const PEN_STYLE: ResolvedStyle = {
    stroke: "var(--pen)",
    fill: "none",
    strokeWidth: 5,
    dashed: false,
    opacity: 0.85,
    z: 0,
};

/** The pen layer as shapes: a line piece per segment, a crossed pair for X, a ring for O. */
const penShapes = (pen: PenState, origin: Point, cellSize: number): Shape[] => {
    const at = (p: { x: number; y: number }): Point => ({
        x: origin.x + (p.x * cellSize) / 2,
        y: origin.y + (p.y * cellSize) / 2,
    });
    const shapes: Shape[] = pen.segments.map((key) => {
        const [a, b] = parseSegmentKey(key);
        return { kind: "polyline", points: [at(a), at(b)], style: PEN_STYLE, rounded: true };
    });
    for (const [key, mark] of Object.entries(pen.marks)) {
        const point = parsePointKey(key);
        const c = at(point);
        // On a cell's centre a mark is big enough to ring the digit yet stay inside the cell
        // (the stroke's own width included); on an edge or corner it sits between cells, so smaller.
        const centred = point.x % 2 !== 0 && point.y % 2 !== 0;
        const reach = cellSize * (centred ? 0.38 : 0.22);
        if (mark === "o") {
            shapes.push({ kind: "circle", cx: c.x, cy: c.y, r: reach, style: PEN_STYLE });
            continue;
        }
        shapes.push(
            {
                kind: "polyline",
                points: [
                    { x: c.x - reach, y: c.y - reach },
                    { x: c.x + reach, y: c.y + reach },
                ],
                style: PEN_STYLE,
                rounded: true,
            },
            {
                kind: "polyline",
                points: [
                    { x: c.x - reach, y: c.y + reach },
                    { x: c.x + reach, y: c.y - reach },
                ],
                style: PEN_STYLE,
                rounded: true,
            },
        );
    }
    return shapes;
};

interface Margin {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

/** Rough extent of a shape (text width is estimated from its length — good enough to size a margin). */
const extent = (shape: Shape): { minX: number; minY: number; maxX: number; maxY: number } => {
    const of = (points: readonly Point[]) => ({
        minX: Math.min(...points.map((p) => p.x)),
        minY: Math.min(...points.map((p) => p.y)),
        maxX: Math.max(...points.map((p) => p.x)),
        maxY: Math.max(...points.map((p) => p.y)),
    });
    switch (shape.kind) {
        case "polyline":
        case "polygon":
            return of(shape.points);
        case "circle":
            return {
                minX: shape.cx - shape.r,
                minY: shape.cy - shape.r,
                maxX: shape.cx + shape.r,
                maxY: shape.cy + shape.r,
            };
        case "rect":
            return { minX: shape.x, minY: shape.y, maxX: shape.x + shape.w, maxY: shape.y + shape.h };
        case "text": {
            const halfW = (shape.text.length * shape.fontSize * 0.6) / 2;
            const halfH = shape.fontSize / 2;
            return { minX: shape.x - halfW, minY: shape.y - halfH, maxX: shape.x + halfW, maxY: shape.y + halfH };
        }
        case "arrowhead":
            return of([
                { x: shape.at.x - shape.size, y: shape.at.y - shape.size },
                { x: shape.at.x + shape.size, y: shape.at.y + shape.size },
            ]);
        case "cage":
            return of(shape.segments.flat());
    }
};

/** How far (in pixels) shapes reach past each side of the `width` x `height` grid. */
const overhang = (shapes: readonly Shape[], width: number, height: number): Margin => {
    const m = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const shape of shapes) {
        const e = extent(shape);
        m.left = Math.max(m.left, -e.minX);
        m.top = Math.max(m.top, -e.minY);
        m.right = Math.max(m.right, e.maxX - width);
        m.bottom = Math.max(m.bottom, e.maxY - height);
    }
    return m;
};

const translatePoint = (p: Point, dx: number, dy: number): Point => ({ x: p.x + dx, y: p.y + dy });

const translateShape = (shape: Shape, dx: number, dy: number): Shape => {
    switch (shape.kind) {
        case "polyline":
        case "polygon":
            return { ...shape, points: shape.points.map((p) => translatePoint(p, dx, dy)) };
        case "circle":
            return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
        case "rect":
        case "text":
            return { ...shape, x: shape.x + dx, y: shape.y + dy };
        case "arrowhead":
            return { ...shape, at: translatePoint(shape.at, dx, dy) };
        case "cage":
            return {
                ...shape,
                segments: shape.segments.map(([a, b]) => [translatePoint(a, dx, dy), translatePoint(b, dx, dy)]),
                label: shape.label && { ...shape.label, x: shape.label.x + dx, y: shape.label.y + dy },
            };
    }
};

const translateScene = (scene: Scene, dx: number, dy: number): Scene => ({
    ...scene,
    cells: scene.cells.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy })),
    gridLines: scene.gridLines.map((l) => ({ ...l, points: l.points.map((p) => translatePoint(p, dx, dy)) })),
    shapes: scene.shapes.map((s) => translateShape(s, dx, dy)),
    selectionOutline: scene.selectionOutline.map(([a, b]) => [translatePoint(a, dx, dy), translatePoint(b, dx, dy)]),
});

/** A lone cell is already marked by the cursor ring; only a larger selection gets the combined outline. */
const selectionOutline = (
    selected: ReadonlySet<CellId>,
    cursor: CellId | null,
    geometry: Geometry,
    cellSize: number,
): [Point, Point][] => {
    if (selected.size === 0 || (selected.size === 1 && selected.has(cursor as CellId))) return [];
    const scale = (p: Point): Point => ({ x: p.x * cellSize, y: p.y * cellSize });
    return cageOutline([...selected], geometry).map(([a, b]) => [scale(a), scale(b)]);
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

/** Recolors a shape to the same red used elsewhere for "this breaks a rule"
 *  (--violated-line) — stroke always, fill too unless it was already "none"
 *  (a filled shape like a thermometer's bulb should still read as filled). */
const markInvalid = (shape: Shape): Shape => ({
    ...shape,
    style: {
        ...shape.style,
        stroke: "var(--violated-line)",
        fill: shape.style.fill === "none" ? "none" : "var(--violated-line)",
    },
});

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
            const pts = trimPolyline(
                obj.points.map((r) => scalePoint(resolvePointRef(r, geometry), cellSize)),
                (obj.trim?.start ?? 0) * cellSize,
                (obj.trim?.end ?? 0) * cellSize,
            );
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
            return [{ kind: "text", x: p.x, y: p.y, text: obj.text, fontSize, bold: obj.style?.bold ?? false, style }];
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

/** Cuts `start` off the front and `end` off the back of a polyline, measured along it.
 *  Left whole if there isn't enough line to cut (so a short line never vanishes). */
const trimPolyline = (points: Point[], start: number, end: number): Point[] => {
    if (points.length < 2 || (start <= 0 && end <= 0)) return points;
    const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
    const total = lengths.reduce((a, b) => a + b, 0);
    if (total <= start + end) return points;

    const pointAt = (distance: number): { point: Point; segment: number } => {
        let remaining = distance;
        for (let i = 0; i < lengths.length; i++) {
            if (remaining <= lengths[i] || i === lengths.length - 1) {
                const t = lengths[i] === 0 ? 0 : Math.min(remaining / lengths[i], 1);
                const a = points[i];
                const b = points[i + 1];
                return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, segment: i };
            }
            remaining -= lengths[i];
        }
        return { point: points[points.length - 1], segment: lengths.length - 1 };
    };

    const from = pointAt(start);
    const to = pointAt(total - end);
    return [from.point, ...points.slice(from.segment + 1, to.segment + 1), to.point];
};

const INSET = 0.08;

/**
 * The dashed outline of a set of cells: one inset segment per cell edge that faces a
 * cell *outside* the set, each running corner to corner so neighbouring segments meet
 * exactly (no overshoot past a corner, no gap). Generic to any geometry that reports
 * cell corners.
 *
 * Every boundary edge is walked clockwise (interior on its right), so the edge that
 * continues it at a vertex is the one starting there. A corner point sits INSET along
 * the inward normals of both edges meeting at it — a mitre, which for the right angles
 * of a grid is the true inset corner whether the outline turns convex or concave.
 */
export const cageOutline = (cells: readonly CellId[], geometry: Geometry): [Point, Point][] => {
    const set = new Set(cells);
    const edges: { a: Point; b: Point }[] = [];

    for (const cell of cells) {
        const tl = geometry.anchor(cell, "tl");
        const tr = geometry.anchor(cell, "tr");
        const bl = geometry.anchor(cell, "bl");
        const br = geometry.anchor(cell, "br");

        const outside = (dir: "up" | "down" | "left" | "right"): boolean => {
            const next = geometry.step(cell, dir);
            return !next || !set.has(next);
        };

        if (outside("up")) edges.push({ a: tl, b: tr });
        if (outside("right")) edges.push({ a: tr, b: br });
        if (outside("down")) edges.push({ a: br, b: bl });
        if (outside("left")) edges.push({ a: bl, b: tl });
    }

    const key = (p: Point): string => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
    const startingAt = new Map<string, number[]>();
    edges.forEach((e, i) => {
        const k = key(e.a);
        startingAt.set(k, [...(startingAt.get(k) ?? []), i]);
    });

    const direction = (e: { a: Point; b: Point }): Point => {
        const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) || 1;
        return { x: (e.b.x - e.a.x) / len, y: (e.b.y - e.a.y) / len };
    };
    // Interior is on the right of travel; in screen coordinates (y down) that is (-dy, dx).
    const normal = (e: { a: Point; b: Point }): Point => {
        const d = direction(e);
        return { x: -d.y, y: d.x };
    };

    // The edge that continues `edge` at its end. Where two outlines pinch at one vertex
    // (cells touching only diagonally) prefer turning toward the interior, which keeps
    // each cell's corner separate.
    const nextOf = (edge: { a: Point; b: Point }): { a: Point; b: Point } | undefined => {
        const d = direction(edge);
        const turn = (e: { a: Point; b: Point }): number => {
            const o = direction(e);
            return d.x * o.y - d.y * o.x; // > 0: turns right on screen
        };
        const candidates = (startingAt.get(key(edge.b)) ?? []).map((i) => edges[i]);
        return candidates.sort((x, y) => turn(y) - turn(x))[0];
    };

    const corner = (vertex: Point, n1: Point, n2: Point): Point => {
        const straight = Math.abs(n1.x - n2.x) < 1e-9 && Math.abs(n1.y - n2.y) < 1e-9;
        return straight
            ? { x: vertex.x + n1.x * INSET, y: vertex.y + n1.y * INSET }
            : { x: vertex.x + (n1.x + n2.x) * INSET, y: vertex.y + (n1.y + n2.y) * INSET };
    };

    const previousOf = new Map<{ a: Point; b: Point }, { a: Point; b: Point }>();
    for (const e of edges) {
        const next = nextOf(e);
        if (next) previousOf.set(next, e);
    }

    return edges.map((e) => {
        const next = nextOf(e);
        const prev = previousOf.get(e);
        const n = normal(e);
        return [corner(e.a, prev ? normal(prev) : n, n), corner(e.b, n, next ? normal(next) : n)] as [Point, Point];
    });
};

const cageLabelAnchor = (cells: readonly CellId[], geometry: Geometry): Point | undefined => {
    let best: { cell: CellId; p: Point } | undefined;
    for (const cell of cells) {
        const p = geometry.anchor(cell, "tl");
        if (!best || p.y < best.p.y || (p.y === best.p.y && p.x < best.p.x)) best = { cell, p };
    }
    return best ? { x: best.p.x + INSET + 0.02, y: best.p.y + INSET + 0.18 } : undefined;
};

/** Major (region boundary) lines draw heavier than plain cell dividers, and come last
 *  so a thin divider that meets one never paints over it (the array is draw order). */
const gridLines = (geometry: Geometry, cellSize: number): { points: Point[]; weight: number }[] =>
    geometry
        .boardLines()
        .map((l) => ({
            points: l.points.map((p) => scalePoint(p, cellSize)),
            weight: l.major ? 3 : 1,
        }))
        .sort((a, b) => a.weight - b.weight);
