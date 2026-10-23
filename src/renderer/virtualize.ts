/**
 * Pure viewport-culling helpers for the pan/zoom board (#48). `buildScene()`
 * always builds the full cell/shape list — a puzzle's geometry is independent
 * of any viewport — so culling is purely a rendering concern, applied by
 * `Board.tsx` just before mapping shapes to SVG elements. Until a view is
 * established (or on a puzzle small enough that it never needs to cull
 * anything out), everything just renders, same as before this card.
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

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 1.25;

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * Pans/zooms a SudokuPad-style board: the visible rect (in board units) *is*
 * the SVG's viewBox, directly. No scrolling, no scaling the SVG's own pixel
 * size — the container is whatever size CSS gives it, and this rect decides
 * what portion of the board fills that container.
 */

/**
 * A view rect centered on the whole scene, scaled (and letterboxed) to fit
 * `containerWidth` x `containerHeight`, same as the "Fit" toolbar button —
 * clamped to the same MIN_ZOOM..MAX_ZOOM range as manual zooming, so the
 * initial fit can never land somewhere the player couldn't also reach by
 * hand. (#77 follow-up: this used to cap at 1 — never scale up past native
 * size — but that fought with Board.tsx's own box-sizing cap to pin small
 * puzzles at an undersized box no matter how much screen was available;
 * growing to fill available space, SudokuPad-style, is the actual goal.)
 */
export const fitView = (
    sceneWidth: number,
    sceneHeight: number,
    containerWidth: number,
    containerHeight: number,
): ViewportRect => {
    const scale = clamp(Math.min(containerWidth / sceneWidth, containerHeight / sceneHeight), MIN_ZOOM, MAX_ZOOM);
    const width = containerWidth / scale;
    const height = containerHeight / scale;
    return { left: (sceneWidth - width) / 2, top: (sceneHeight - height) / 2, width, height };
};

/** Keeps a view rect from drifting so far that it no longer overlaps the scene at all. */
export const clampView = (view: ViewportRect, sceneWidth: number, sceneHeight: number): ViewportRect => ({
    left: clamp(view.left, Math.min(0, sceneWidth - view.width), Math.max(0, sceneWidth - view.width)),
    top: clamp(view.top, Math.min(0, sceneHeight - view.height), Math.max(0, sceneHeight - view.height)),
    width: view.width,
    height: view.height,
});

/** Shifts a view rect by a board-unit delta (e.g. from a pan drag), clamped to stay over the scene. */
export const panView = (
    view: ViewportRect,
    sceneWidth: number,
    sceneHeight: number,
    dx: number,
    dy: number,
): ViewportRect => clampView({ ...view, left: view.left + dx, top: view.top + dy }, sceneWidth, sceneHeight);

/**
 * Zooms a view rect by `factor` (>1 zooms in) while keeping the board-unit point
 * under the fractional container position (`fracX`/`fracY`, each 0..1) stationary
 * on screen — the "zoom toward the cursor" feel of a map/graphics app. The zoom
 * bound is in terms of `containerWidth` (actual on-screen pixels per board unit),
 * not scene size — so it zooms just as deep into a tiny board as a huge one.
 */
export const zoomViewAt = (
    view: ViewportRect,
    sceneWidth: number,
    sceneHeight: number,
    containerWidth: number,
    fracX: number,
    fracY: number,
    factor: number,
): ViewportRect => {
    const minWidth = containerWidth / MAX_ZOOM;
    const maxWidth = containerWidth / MIN_ZOOM;
    const newWidth = clamp(view.width / factor, minWidth, maxWidth);
    const newHeight = newWidth * (view.height / view.width);

    const anchorX = view.left + fracX * view.width;
    const anchorY = view.top + fracY * view.height;

    return clampView(
        { left: anchorX - fracX * newWidth, top: anchorY - fracY * newHeight, width: newWidth, height: newHeight },
        sceneWidth,
        sceneHeight,
    );
};

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
