import { describe, expect, it } from "vitest";

import {
    EMPTY_PEN,
    cycleMark,
    applyStroke,
    sanitizePen,
    segmentKey,
    snapToLattice,
    strokeSegments,
} from "@/runtime/pen.ts";

describe("pen layer", () => {
    it("snaps a pixel position to the nearest half-cell point, relative to the grid origin", () => {
        const origin = { x: 10, y: 20 };
        // Cell size is 64. The centre of the first cell is half a cell in = lattice (1,1).
        expect(snapToLattice(10 + 32, 20 + 32, origin, 64)).toEqual({ x: 1, y: 1 });
        // This point is near the corner that the next cell shares -> (2,2).
        expect(snapToLattice(10 + 60, 20 + 66, origin, 64)).toEqual({ x: 2, y: 2 });
        expect(snapToLattice(10, 20, origin, 64)).toEqual({ x: 0, y: 0 });
    });

    it("names a segment the same whichever way it was drawn", () => {
        expect(segmentKey({ x: 2, y: 1 }, { x: 1, y: 1 })).toBe(segmentKey({ x: 1, y: 1 }, { x: 2, y: 1 }));
    });

    it("fills in lattice points a fast drag skipped, including diagonals", () => {
        expect(
            strokeSegments([
                { x: 0, y: 0 },
                { x: 3, y: 0 },
            ]),
        ).toHaveLength(3);
        expect(
            strokeSegments([
                { x: 0, y: 0 },
                { x: 2, y: 1 },
            ]),
        ).toHaveLength(2);
        expect(strokeSegments([{ x: 1, y: 1 }])).toEqual([]);
    });

    it("rubs out a line drawn over itself, and adds only what is missing otherwise", () => {
        const line = [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
        ];
        const drawn = applyStroke(EMPTY_PEN, line);
        expect(drawn.segments).toHaveLength(2);
        expect(applyStroke(drawn, [...line].reverse()).segments).toEqual([]);

        const longer = applyStroke(drawn, [
            { x: 0, y: 0 },
            { x: 3, y: 0 },
        ]);
        expect(longer.segments).toHaveLength(3);
    });

    it("cycles a point through X, O, then nothing", () => {
        const p = { x: 2, y: 1 };
        const x = cycleMark(EMPTY_PEN, p);
        expect(x.marks).toEqual({ "2,1": "x" });
        const o = cycleMark(x, p);
        expect(o.marks).toEqual({ "2,1": "o" });
        expect(cycleMark(o, p).marks).toEqual({});
    });

    it("reads stored data defensively", () => {
        const pen = sanitizePen({
            segments: ["1,1|2,1", "2,1|1,1", "0,0|5,5", "junk", 7],
            marks: { "1,1": "x", "2,2": "z", bad: "o" },
        });
        expect(pen.segments).toEqual(["1,1|2,1"]);
        expect(pen.marks).toEqual({ "1,1": "x" });
        expect(sanitizePen(null)).toEqual(EMPTY_PEN);
    });
});
