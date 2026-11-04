import { describe, expect, it } from "vitest";

import {
    CORNER_ZONE,
    cellsAreNeighbours,
    cellsTouchDiagonally,
    centerNoteFontFactor,
    cullToViewport,
    isNearCorner,
} from "@/renderer/board_math.ts";
import type { CellShape, Scene } from "@/renderer/scene.ts";

describe("cellsAreNeighbours", () => {
    it("is true for cells that share an edge", () => {
        expect(cellsAreNeighbours("r2c2", "r2c3")).toBe(true);
        expect(cellsAreNeighbours("r2c2", "r1c2")).toBe(true);
        expect(cellsAreNeighbours("r10c10", "r10c11")).toBe(true);
    });
    it("is false for diagonals, the same cell, distant cells and ids that are not grid cells", () => {
        expect(cellsAreNeighbours("r2c2", "r3c3")).toBe(false);
        expect(cellsAreNeighbours("r2c2", "r2c2")).toBe(false);
        expect(cellsAreNeighbours("r2c2", "r2c4")).toBe(false);
        expect(cellsAreNeighbours("a", "r2c2")).toBe(false);
        expect(cellsAreNeighbours("r2c2", "x:3")).toBe(false);
    });
});

describe("cellsTouchDiagonally", () => {
    it("is true for cells that share only a corner", () => {
        expect(cellsTouchDiagonally("r2c2", "r3c3")).toBe(true);
        expect(cellsTouchDiagonally("r2c2", "r1c3")).toBe(true);
    });
    it("is false for edge neighbours, the same cell, distant cells and ids that are not grid cells", () => {
        expect(cellsTouchDiagonally("r2c2", "r2c3")).toBe(false);
        expect(cellsTouchDiagonally("r2c2", "r2c2")).toBe(false);
        expect(cellsTouchDiagonally("r2c2", "r4c4")).toBe(false);
        expect(cellsTouchDiagonally("n1", "r2c2")).toBe(false);
    });
});

describe("isNearCorner", () => {
    it("is true only where both an x edge and a y edge are close", () => {
        expect(isNearCorner(0.05, 0.05)).toBe(true);
        expect(isNearCorner(0.95, 0.1)).toBe(true);
        expect(isNearCorner(0.1, 0.9)).toBe(true);
        expect(isNearCorner(0.95, 0.95)).toBe(true);
    });
    it("is false along an edge but away from the corners, and in the middle", () => {
        expect(isNearCorner(0.05, 0.5)).toBe(false);
        expect(isNearCorner(0.5, 0.95)).toBe(false);
        expect(isNearCorner(0.5, 0.5)).toBe(false);
    });
    it("treats the zone boundary as outside", () => {
        expect(isNearCorner(CORNER_ZONE, CORNER_ZONE)).toBe(false);
        expect(isNearCorner(1 - CORNER_ZONE, 1 - CORNER_ZONE)).toBe(false);
    });
});

describe("centerNoteFontFactor", () => {
    it("is capped for one or two candidates, so they do not read as a huge digit", () => {
        expect(centerNoteFontFactor(1)).toBe(0.3);
        expect(centerNoteFontFactor(2)).toBe(0.3);
    });
    it("shrinks as the run grows", () => {
        expect(centerNoteFontFactor(3)).toBeGreaterThan(centerNoteFontFactor(5));
        expect(centerNoteFontFactor(5)).toBeGreaterThan(centerNoteFontFactor(8));
    });
    it("keeps the rendered width near 82% of the cell while that is reachable", () => {
        for (const n of [5, 6, 9, 12]) expect(centerNoteFontFactor(n) * n * 0.6).toBeCloseTo(0.82);
    });
    it("stops shrinking at a legible floor", () => {
        expect(centerNoteFontFactor(30)).toBe(0.11);
        expect(centerNoteFontFactor(100)).toBe(0.11);
    });
});

describe("cullToViewport", () => {
    const cell = (row: number, col: number): CellShape => ({
        cell: `r${row}c${col}`,
        x: (col - 1) * 10,
        y: (row - 1) * 10,
        size: 10,
        tone: "normal",
        ring: null,
        value: null,
        given: false,
        notes: [],
        centerNotes: [],
        ruledOutNotes: [],
        flagged: false,
        incorrect: false,
        hidden: false,
        sameValue: false,
        marks: [],
    });
    const scene: Scene = {
        width: 100,
        height: 100,
        viewBox: "0 0 100 100",
        cellSize: 10,
        cells: Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => cell(r + 1, c + 1))).flat(),
        gridLines: [
            {
                points: [
                    { x: 0, y: 5 },
                    { x: 100, y: 5 },
                ],
                weight: 1,
            },
            {
                points: [
                    { x: 0, y: 95 },
                    { x: 100, y: 95 },
                ],
                weight: 1,
            },
        ] as Scene["gridLines"],
        shapes: [],
        selectionOutline: [],
        origin: { x: 0, y: 0 },
        pen: [],
    };

    it("returns the very same scene when there is no viewport yet", () => {
        expect(cullToViewport(scene, null)).toBe(scene);
    });

    it("keeps what is in view plus a margin of two cells, and drops the rest", () => {
        const culled = cullToViewport(scene, { left: 0, top: 0, width: 20, height: 20 });
        const ids = new Set(culled.cells.map((c) => c.cell));
        expect(ids.has("r1c1")).toBe(true);
        expect(ids.has("r2c2")).toBe(true);
        expect(ids.has("r10c10")).toBe(false);
        expect(culled.cells.length).toBeLessThan(scene.cells.length);
        // grid lines are culled as well
        expect(culled.gridLines).toHaveLength(1);
        // other fields are untouched
        expect(culled.width).toBe(100);
        expect(culled.origin).toBe(scene.origin);
    });

    it("keeps everything when the viewport covers the whole scene", () => {
        const culled = cullToViewport(scene, { left: 0, top: 0, width: 100, height: 100 });
        expect(culled.cells).toHaveLength(100);
        expect(culled.gridLines).toHaveLength(2);
    });
});
