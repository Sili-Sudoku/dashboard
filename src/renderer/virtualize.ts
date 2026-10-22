/**
 * Pure viewport-culling helpers for large boards (#48). `buildScene()` always
 * builds the full cell/shape list — a puzzle's geometry is independent of any
 * viewport — so culling is purely a rendering concern, applied by `Board.tsx`
 * just before mapping shapes to SVG elements. Below a cell-count threshold,
 * `Board.tsx` skips this entirely and renders everything, unchanged from
 * before this card.
 */

import type { Point } from "@/runtime/geometry.ts";
import type { CellShape, Shape } from "@/renderer/scene.ts";

/** A visible pixel rect, in the same coordinate space as `Scene` (absolute px). */
export interface ViewportRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** Only switch to a scrollable, culled viewport above this many cells. */
export const VIRTUALIZE_CELL_THRESHOLD = 400;

/** Grows a viewport by `margin` on every side — cull *slightly* outside what's visible, not exactly at the edge. */
export const expandViewport = (v: ViewportRect, margin: number): ViewportRect => ({
    left: v.left - margin,
    top: v.top - margin,
    width: v.width + margin * 2,
    height: v.height + margin * 2,
});

const rectsIntersect = (ax: number, ay: number, aw: number, ah: number, v: ViewportRect): boolean =>
    ax < v.left + v.width && ax + aw > v.left && ay < v.top + v.height && ay + ah > v.top;

export const cellInViewport = (c: Pick<CellShape, "x" | "y" | "size">, v: ViewportRect): boolean =>
    rectsIntersect(c.x, c.y, c.size, c.size, v);

export const lineInViewport = (points: readonly Point[], v: ViewportRect): boolean => {
    const box = pointsBounds(points);
    return rectsIntersect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY, v);
};

export const shapeInViewport = (shape: Shape, v: ViewportRect): boolean => {
    const box = shapeBounds(shape);
    return rectsIntersect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY, v);
};

const pointsBounds = (points: readonly Point[]): { minX: number; minY: number; maxX: number; maxY: number } => {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
};

const shapeBounds = (shape: Shape): { minX: number; minY: number; maxX: number; maxY: number } => {
    switch (shape.kind) {
        case "polyline":
        case "polygon":
            return pointsBounds(shape.points);
        case "circle":
            return { minX: shape.cx - shape.r, minY: shape.cy - shape.r, maxX: shape.cx + shape.r, maxY: shape.cy + shape.r };
        case "rect":
            return { minX: shape.x, minY: shape.y, maxX: shape.x + shape.w, maxY: shape.y + shape.h };
        case "text":
            return { minX: shape.x, minY: shape.y, maxX: shape.x, maxY: shape.y };
        case "arrowhead":
            return {
                minX: shape.at.x - shape.size,
                minY: shape.at.y - shape.size,
                maxX: shape.at.x + shape.size,
                maxY: shape.at.y + shape.size,
            };
        case "cage":
            return pointsBounds(shape.segments.flat());
    }
};
