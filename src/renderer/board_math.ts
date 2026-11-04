/** Pure helpers of the board: cell neighbour tests, viewport culling and note sizing. */

import type { CellId } from "@/runtime/geometry.ts";
import type { Scene } from "@/renderer/scene.ts";
import {
    cellInViewport,
    clamp,
    expandViewport,
    lineInViewport,
    shapeInViewport,
    type ViewportRect,
} from "@/renderer/virtualize.ts";

/** How far from a cell's edges (a fraction of its size) the pointer counts as near a corner. */
export const CORNER_ZONE = 0.3;

const parseCell = (cell: CellId): { row: number; col: number } | null => {
    const m = /^r(\d+)c(\d+)$/.exec(cell);
    return m ? { row: Number(m[1]), col: Number(m[2]) } : null;
};

export const cellsAreNeighbours = (a: CellId, b: CellId): boolean => {
    const p = parseCell(a);
    const q = parseCell(b);
    return !!p && !!q && Math.abs(p.row - q.row) + Math.abs(p.col - q.col) === 1;
};

export const cellsTouchDiagonally = (a: CellId, b: CellId): boolean => {
    const p = parseCell(a);
    const q = parseCell(b);
    return !!p && !!q && Math.abs(p.row - q.row) === 1 && Math.abs(p.col - q.col) === 1;
};

/** The point (as fractions of the cell box, 0..1) is close to both an x edge and a y edge. */
export const isNearCorner = (fx: number, fy: number): boolean =>
    (fx < CORNER_ZONE || fx > 1 - CORNER_ZONE) && (fy < CORNER_ZONE || fy > 1 - CORNER_ZONE);

/**
 * Culls scene.cells/gridLines/shapes to a margin around `viewport`.
 * Returns `scene` unchanged when `viewport` is null.
 */
export const cullToViewport = (scene: Scene, viewport: ViewportRect | null): Scene => {
    if (!viewport) return scene;
    const v = expandViewport(viewport, scene.cellSize * 2);
    return {
        ...scene,
        cells: scene.cells.filter((c) => cellInViewport(c, v)),
        gridLines: scene.gridLines.filter((l) => lineInViewport(l.points, v)),
        shapes: scene.shapes.filter((s) => shapeInViewport(s, v)),
    };
};

/** Center notes share one text run. More candidates leave less room for each one.
 * A flat shrink rate for each character does not follow the rendered width of the text.
 * Short runs looked tiny and wasted space. Longer runs still grew toward the edge of the cell.
 * This code instead targets a roughly constant *rendered width* (~82% of the cell).
 * This leaves a clean margin on each side. It holds while the target is achievable.
 * It uses a typical ratio of digit width to font size.
 * MAX stops a run of 1-2 candidates from filling most of the cell.
 * Such a run would read as a huge digit that is off center.
 * MIN stops a long run (the candidate list of a large-domain puzzle) from shrinking until it is not legible.
 * That run overflows the target width a little. */
const CENTER_NOTE_TARGET_WIDTH = 0.82;
const CENTER_NOTE_GLYPH_WIDTH_EM = 0.6;
export const centerNoteFontFactor = (charCount: number): number =>
    clamp(CENTER_NOTE_TARGET_WIDTH / (charCount * CENTER_NOTE_GLYPH_WIDTH_EM), 0.11, 0.3);
