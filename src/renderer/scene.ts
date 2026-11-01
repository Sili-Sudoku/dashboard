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

    return {
        width,
        height,
        viewBox: `0 0 ${width} ${height}`,
        cellSize,
        cells,
        gridLines: gridLines(geometry, cellSize),
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

/** Recolors a shape to the same red used elsewhere for "this breaks a rule"
 *  (--violated-line) — stroke always, fill too unless it was already "none"
 *  (a filled shape like a thermometer's bulb should still read as filled). */
const markInvalid = (shape: Shape): Shape => ({
    ...shape,
    style: { ...shape.style, stroke: "var(--violated-line)", fill: shape.style.fill === "none" ? "none" : "var(--violated-line)" },
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

/** Major (region boundary) lines draw heavier than plain cell dividers. */
const gridLines = (geometry: Geometry, cellSize: number): { points: Point[]; weight: number }[] =>
    geometry.boardLines().map((l) => ({
        points: l.points.map((p) => scalePoint(p, cellSize)),
        weight: l.major ? 3 : 1,
    }));
