/**
 * Pure geometry for the renderer. It converts the generic visual objects of a puzzle and
 * the board state into flat lists of drawable shapes in absolute pixel coordinates.
 *
 * The renderer component (`Board.tsx`) is a thin mapping from these shapes to
 * SVG elements. Nothing here or there knows what a thermometer is.
 * It knows "path", "circle", "line", "cage" (an outline around a cell set), and so on.
 */

import type { BoardLine, CellId, Geometry, Point } from "@/runtime/geometry.ts";
import { createGeometry } from "@/runtime/geometry.ts";
import type { CompiledPuzzle, PatternName, PointRef, VisualObject, VisualStyle } from "@/runtime/puzzle.ts";
import type { EvaluationResult } from "@/runtime/evaluate.ts";
import { MARK_COLOR_COUNT, resolveMarkColor } from "@/runtime/mark_colors.ts";
import { parsePointKey, parseSegmentKey, type PenState } from "@/runtime/pen.ts";

export interface SceneInput {
    puzzle: CompiledPuzzle;
    /**
     * Expected to be fog-aware already (see `PuzzleSession.displayState`).
     * For a hidden given, this must be the own entry of the player, if any, and not
     * the real value of the given. This module does not mask it further.
     */
    valueOf: (cell: CellId) => number | null;
    notesOf: (cell: CellId) => readonly number[];
    centerNotesOf: (cell: CellId) => readonly number[];
    /** Cells flagged by PuzzleSession.checkNotesOnLeave/checkAgainstSolution (a bad note elimination). */
    flaggedCells: ReadonlySet<CellId>;
    /** Cells flagged by PuzzleSession.checkAgainstSolution as holding a value that does not match the solution. */
    incorrectCells: ReadonlySet<CellId>;
    /** Structural given-ness, independent of fog. `buildScene` combines it with `hiddenCells` itself. */
    isGiven: (cell: CellId) => boolean;
    selection: ReadonlySet<CellId>;
    cursor: CellId | null;
    evaluation: EvaluationResult;
    /** Cells that fog still hides (see `runtime/fog.ts`). */
    hiddenCells: ReadonlySet<CellId>;
    /**
     * Cells not on the board yet (an `appear` of a dynamic rule).
     * They are left out of the scene, with the lines around them.
     */
    absentCells?: ReadonlySet<CellId>;
    /** Compiled constraint ids (see `compile.ts`'s `solutionViolations`) to draw
     *  in red instead of their normal style. Example: the visual builder on the Author page
     *  shows a constraint that conflicts with the declared solution of the puzzle,
     *  and does not hide it. */
    invalidConstraintIds?: ReadonlySet<string>;
    /** Flag every other cell that shows the same value as the cursor cell (#73).
     *  This is only visual. It does not change the real selection or cursor. */
    highlightSameValue?: boolean;
    /** The note digits that a placed digit already rules out, for each cell. They are drawn as wrong. */
    ruledOutNotes?: ReadonlyMap<CellId, ReadonlySet<number>>;
    /** Colour marks for each cell, as palette indices (#35), resolved against `markPalette`. */
    colorsOf?: (cell: CellId) => readonly number[];
    markPalette?: readonly string[];
    /** The pen layer of the player (#45): freehand lines and X/O marks, drawn over the digits. */
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
    /** The notes (corner and centre) that a placed digit already rules out. */
    ruledOutNotes: readonly number[];
    /** Flagged by checkNotesOnLeave/checkAgainstSolution. The notes left do not include the solution digit. */
    flagged: boolean;
    /** Flagged by checkAgainstSolution: the placed value does not match the solution. */
    incorrect: boolean;
    /** Still hidden by fog. The renderer paints over it, so the value under it does not leak. */
    hidden: boolean;
    /** Shows the same value as the cursor cell (#73). It is a passive highlight, separate from tone and ring. */
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
    /** A repeating pattern or a picture in place of the plain colour (see `ShapeNode`). */
    pattern?: PatternName;
    image?: string;
    /** Pixels per cell, so the tile of a pattern scales with the board. Set when there is a pattern or image. */
    unit?: number;
    /** The box that a picture is fitted to: the extent of the whole object, not of each cell. */
    bounds?: { x: number; y: number; w: number; h: number };
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
    /** Where the top-left corner of the grid is in the scene (the margin kept for outside clues). */
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

    // The visible value of the cursor cell (null while it is empty or hidden by fog).
    // So a hidden cell cannot reveal where its digit appears.
    const sameAs = input.highlightSameValue && input.cursor ? input.valueOf(input.cursor) : null;

    const absent = input.absentCells;
    const shownCells = absent ? geometry.cells.filter((cell) => !absent.has(cell)) : geometry.cells;
    const cells: CellShape[] = shownCells.map((cell) => {
        const p = geometry.anchor(cell, "tl");
        const hidden = input.hiddenCells.has(cell);
        return {
            cell,
            x: p.x * cellSize,
            y: p.y * cellSize,
            size: cellSize,
            tone: tone(cell, violated, invalid),
            ring: ring(cell, input.cursor, selected),
            // `valueOf`/`notesOf`/etc. are expected to be fog-aware already
            // (see PuzzleSession.displayState). The *mystery* value of a hidden given
            // is not passed through at all. Only the own entry of the player under it is, if any.
            // So there is nothing left to mask here.
            value: input.valueOf(cell),
            // Draw the given-digit style only when the given is shown as one.
            // While it is hidden, any value here is the own guess of the player (not authoritative), not the clue.
            given: input.isGiven(cell) && !hidden,
            notes: input.notesOf(cell),
            centerNotes: input.centerNotesOf(cell),
            ruledOutNotes: [...(input.ruledOutNotes?.get(cell) ?? [])],
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

    // Content that a definition places outside the grid (sandwich/X-sum/room clues, #130) gets a
    // margin on each side where it overhangs. So the viewBox does not clip it.
    // Then everything shifts right/down by the left/top margin, so the scene stays anchored
    // at the origin 0,0. Pan/zoom, culling, and the thumbnail all depend on this.
    const margin = overhang(shapes, width, height);
    const scene: Scene = {
        width: width + margin.left + margin.right,
        height: height + margin.top + margin.bottom,
        viewBox: `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`,
        cellSize,
        cells,
        gridLines: gridLines(geometry, cellSize, absent),
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

/** The pen layer as shapes: a line piece for each segment, a crossed pair for X, a ring for O. */
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
        // On the centre of a cell, a mark is big enough to ring the digit and stay inside the cell
        // (the width of the stroke included). On an edge or corner it sits between cells, so it is smaller.
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

/** Rough extent of a shape. The text width is estimated from its length. This is good enough to size a margin. */
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

/** The cursor ring already marks a lone cell. Only a larger selection gets the combined outline. */
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
 * Board.tsx). It does not compete with the tone fill for the same fill color.
 * So a violated/invalid cell still visibly reacts when it is selected or at the cursor.
 */
const ring = (cell: CellId, cursor: CellId | null, selected: ReadonlySet<CellId>): SelectionRing => {
    if (cell === cursor) return "cursor";
    if (selected.has(cell)) return "selected";
    return null;
};

/** Recolors a shape to the same red used elsewhere for "this breaks a rule"
 *  (--violated-line). The stroke is always red. The fill is red too, unless it was already "none"
 *  (a filled shape, like the bulb of a thermometer, must still read as filled). */
const markInvalid = (shape: Shape): Shape => ({
    ...shape,
    style: {
        ...shape.style,
        stroke: "var(--violated-line)",
        fill: shape.style.fill === "none" ? "none" : "var(--violated-line)",
        image: undefined, // a rule break reads as red, not as a picture
    },
});

export const resolveStyle = (style: VisualStyle | undefined, fallback: Partial<ResolvedStyle> = {}): ResolvedStyle => ({
    stroke: style?.stroke ?? fallback.stroke ?? "var(--ink)",
    fill: style?.fill ?? fallback.fill ?? "none",
    strokeWidth: style?.strokeWidth ?? fallback.strokeWidth ?? 0.06,
    dashed: style?.dashed ?? fallback.dashed ?? false,
    opacity: style?.opacity ?? fallback.opacity ?? 1,
    z: style?.z ?? fallback.z ?? 0,
    ...(style?.pattern ? { pattern: style.pattern } : {}),
    ...(style?.image ? { image: style.image } : {}),
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
    ...(style.pattern || style.image ? { unit: cellSize } : {}),
});

/** The pixel box around a set of shapes, for fitting a picture to the whole object. */
const extentOf = (shapes: readonly Shape[]): { x: number; y: number; w: number; h: number } | undefined => {
    const xs: number[] = [];
    const ys: number[] = [];
    const add = (x: number, y: number): void => {
        xs.push(x);
        ys.push(y);
    };
    for (const s of shapes) {
        if (s.kind === "polyline" || s.kind === "polygon") s.points.forEach((p) => add(p.x, p.y));
        else if (s.kind === "rect") {
            add(s.x, s.y);
            add(s.x + s.w, s.y + s.h);
        }
        else if (s.kind === "circle") {
            add(s.cx - s.r, s.cy - s.r);
            add(s.cx + s.r, s.cy + s.r);
        }
    }
    if (xs.length === 0) return undefined;
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

/** Turn one generic visual object into 1..n absolute-pixel shapes. */
export const describeObject = (obj: VisualObject, geometry: Geometry, cellSize: number): Shape[] => {
    const shapes = shapesOf(obj, geometry, cellSize);
    // Every shape of one object shares one style record. A picture is fitted across all of them.
    const style = shapes[0]?.style;
    if (style?.image) style.bounds = extentOf(shapes);
    return shapes;
};

const shapesOf = (obj: VisualObject, geometry: Geometry, cellSize: number): Shape[] => {
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
 *  Leaves it whole if there is not enough line to cut (so a short line never vanishes). */
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
 * The dashed outline of a set of cells: one inset segment for each cell edge that faces a
 * cell *outside* the set. Each segment runs corner to corner, so neighbouring segments meet
 * exactly (no overshoot past a corner, no gap). It is generic to any geometry that reports
 * cell corners.
 *
 * Every boundary edge is walked clockwise (interior on its right). So the edge that
 * continues it at a vertex is the one that starts there. A corner point sits INSET along
 * the inward normals of both edges that meet at it. This is a mitre. For the right angles
 * of a grid, it is the true inset corner whether the outline turns convex or concave.
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
    // The interior is on the right of travel. In screen coordinates (y down) that is (-dy, dx).
    const normal = (e: { a: Point; b: Point }): Point => {
        const d = direction(e);
        return { x: -d.y, y: d.x };
    };

    // The edge that continues `edge` at its end. Where two outlines pinch at one vertex
    // (cells that touch only diagonally), prefer to turn toward the interior.
    // This keeps the corner of each cell separate.
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

/** Major (region boundary) lines draw heavier than plain cell dividers. They come last,
 *  so a thin divider that meets one never paints over it (the array is draw order). */
const gridLines = (
    geometry: Geometry,
    cellSize: number,
    absent?: ReadonlySet<CellId>,
): { points: Point[]; weight: number }[] =>
    (absent && absent.size > 0 ? withoutAbsent(geometry, absent) : geometry.boardLines())
        .map((l) => ({
            points: l.points.map((p) => scalePoint(p, cellSize)),
            weight: l.major ? 3 : 1,
        }))
        .sort((a, b) => a.weight - b.weight);

/**
 * The board's lines with the absent cells taken out. An edge is drawn only if a present cell is on one
 * side of it. The edge is a heavy outline wherever the board now ends. The code works edge by edge
 * (every geometry's lines here are axis-aligned). Then it joins runs back into long lines.
 */
const withoutAbsent = (geometry: Geometry, absent: ReadonlySet<CellId>): readonly BoardLine[] => {
    const cellAt = new Map<string, CellId>();
    for (const cell of geometry.cells) {
        const c = geometry.center(cell);
        cellAt.set(`${Math.floor(c.x)},${Math.floor(c.y)}`, cell);
    }
    const present = (x: number, y: number) => {
        const cell = cellAt.get(`${x},${y}`);
        return cell !== undefined && !absent.has(cell);
    };
    const kept = new Map<string, { horizontal: boolean; fixed: number; at: number; major: boolean }>();
    const other: BoardLine[] = [];
    for (const line of geometry.boardLines()) {
        const [a, b] = line.points;
        if (!a || !b || line.points.length !== 2 || (a.x !== b.x && a.y !== b.y)) {
            other.push(line);
            continue;
        }
        const horizontal = a.y === b.y;
        const fixed = horizontal ? a.y : a.x;
        const [from, to] = horizontal
            ? [Math.min(a.x, b.x), Math.max(a.x, b.x)]
            : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
        for (let at = from; at < to; at++) {
            // the two cells on each side of this unit edge
            const before = horizontal ? present(at, fixed - 1) : present(fixed - 1, at);
            const after = horizontal ? present(at, fixed) : present(fixed, at);
            if (!before && !after) continue;
            const major = line.major || before !== after;
            const key = `${horizontal}:${fixed}:${at}`;
            kept.set(key, { horizontal, fixed, at, major: (kept.get(key)?.major ?? false) || major });
        }
    }
    const runs = new Map<string, { horizontal: boolean; fixed: number; major: boolean; at: number[] }>();
    for (const e of kept.values()) {
        const key = `${e.horizontal}:${e.fixed}:${e.major}`;
        const run = runs.get(key) ?? { horizontal: e.horizontal, fixed: e.fixed, major: e.major, at: [] };
        run.at.push(e.at);
        runs.set(key, run);
    }
    const lines: BoardLine[] = [...other];
    for (const { horizontal, fixed, major, at } of runs.values()) {
        at.sort((x, y) => x - y);
        let start = at[0] as number;
        at.forEach((last, i) => {
            if (at[i + 1] === last + 1) return;
            lines.push({
                points: horizontal
                    ? [
                          { x: start, y: fixed },
                          { x: last + 1, y: fixed },
                      ]
                    : [
                          { x: fixed, y: start },
                          { x: fixed, y: last + 1 },
                      ],
                major,
            });
            start = at[i + 1] as number;
        });
    }
    return lines;
};
