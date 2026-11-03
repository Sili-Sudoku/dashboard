/**
 * Pure viewport-culling helpers for the pan/zoom board.
 * `buildScene()` always builds the full list of cells and shapes.
 * The geometry of a puzzle does not depend on a viewport, so culling is only a rendering task.
 * `Board.tsx` applies it just before it maps shapes to SVG elements.
 * The board renders everything until a view exists.
 * It also renders everything when the puzzle is small enough that no cell needs culling.
 */

import type { Point } from "@/runtime/geometry.ts";
import type { CellShape, Shape } from "@/renderer/scene.ts";

/** A visible pixel rect in the coordinate space of `Scene` (absolute px). */
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
 * Pan and zoom of a SudokuPad-style board.
 * The visible rect (in board units) is the viewBox of the SVG.
 * The board does not scroll, and the pixel size of the SVG does not change.
 * CSS sets the size of the container.
 * This rect sets which part of the board fills the container.
 */

/**
 * A view rect centered on the whole scene.
 * It is scaled (and letterboxed) to fit `containerWidth` x `containerHeight`, like the "Fit" toolbar button.
 * The scale stays in the MIN_ZOOM..MAX_ZOOM range of manual zoom.
 * So the initial fit is always a zoom level that the player can also reach by hand.
 * (the scale had a cap of 1, so the board never grew past its native size.
 * That cap conflicted with the box-sizing cap in Board.tsx.
 * Small puzzles stayed in a box that was too small, even on a large screen.
 * The goal is to grow to fill the available space, like SudokuPad.)
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

/** Keeps a view rect from moving so far that it no longer overlaps the scene. */
export const clampView = (view: ViewportRect, sceneWidth: number, sceneHeight: number): ViewportRect => ({
    left: clamp(view.left, Math.min(0, sceneWidth - view.width), Math.max(0, sceneWidth - view.width)),
    top: clamp(view.top, Math.min(0, sceneHeight - view.height), Math.max(0, sceneHeight - view.height)),
    width: view.width,
    height: view.height,
});

/** Moves a view rect by a delta in board units (for example from a pan drag). The rect stays over the scene. */
export const panView = (
    view: ViewportRect,
    sceneWidth: number,
    sceneHeight: number,
    dx: number,
    dy: number,
): ViewportRect => clampView({ ...view, left: view.left + dx, top: view.top + dy }, sceneWidth, sceneHeight);

/**
 * Zooms a view rect by `factor` (>1 zooms in).
 * The board-unit point under the fractional container position (`fracX`/`fracY`, each 0..1) stays fixed on screen.
 * This gives the "zoom toward the cursor" behavior of a map or graphics app.
 * The zoom limit uses `containerWidth` (on-screen pixels per board unit), not the scene size.
 * So the zoom depth is the same for a tiny board and a huge board.
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

/** Grows a viewport by `margin` on every side. The cull edge is *slightly* outside the visible area. */
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
            return {
                minX: shape.cx - shape.r,
                minY: shape.cy - shape.r,
                maxX: shape.cx + shape.r,
                maxY: shape.cy + shape.r,
            };
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
