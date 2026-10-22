import { describe, expect, it } from "vitest";
import { cellInViewport, expandViewport, lineInViewport, shapeInViewport, type ViewportRect } from "@/renderer/virtualize.ts";
import type { Shape } from "@/renderer/scene.ts";

const viewport: ViewportRect = { left: 100, top: 100, width: 200, height: 200 };

describe("expandViewport", () => {
    it("grows the rect by the margin on every side", () => {
        expect(expandViewport(viewport, 10)).toEqual({ left: 90, top: 90, width: 220, height: 220 });
    });
});

describe("cellInViewport", () => {
    it("is true for a cell fully inside the viewport", () => {
        expect(cellInViewport({ x: 150, y: 150, size: 20 }, viewport)).toBe(true);
    });

    it("is true for a cell only partially overlapping the viewport", () => {
        expect(cellInViewport({ x: 90, y: 90, size: 20 }, viewport)).toBe(true); // straddles the left/top edge
    });

    it("is false for a cell entirely outside the viewport", () => {
        expect(cellInViewport({ x: 1000, y: 1000, size: 20 }, viewport)).toBe(false);
    });

    it("is false for a cell that only touches the edge with zero overlap", () => {
        expect(cellInViewport({ x: 300, y: 150, size: 20 }, viewport)).toBe(false); // viewport ends at x=300
    });
});

describe("lineInViewport", () => {
    it("is true for a vertical line crossing the viewport", () => {
        expect(lineInViewport([{ x: 150, y: 0 }, { x: 150, y: 1000 }], viewport)).toBe(true);
    });

    it("is false for a vertical line entirely to the left of the viewport", () => {
        expect(lineInViewport([{ x: 10, y: 0 }, { x: 10, y: 1000 }], viewport)).toBe(false);
    });
});

describe("shapeInViewport", () => {
    it("circle: true when its bounding box overlaps", () => {
        const shape: Shape = { kind: "circle", cx: 150, cy: 150, r: 10, style: dummyStyle() };
        expect(shapeInViewport(shape, viewport)).toBe(true);
    });

    it("circle: false when far outside, even accounting for radius", () => {
        const shape: Shape = { kind: "circle", cx: 5000, cy: 5000, r: 10, style: dummyStyle() };
        expect(shapeInViewport(shape, viewport)).toBe(false);
    });

    it("rect: true when overlapping", () => {
        const shape: Shape = { kind: "rect", x: 290, y: 150, w: 50, h: 10, style: dummyStyle() };
        expect(shapeInViewport(shape, viewport)).toBe(true); // starts just inside the right edge
    });

    it("polyline: true when any segment crosses the viewport", () => {
        const shape: Shape = {
            kind: "polyline",
            points: [{ x: 0, y: 0 }, { x: 150, y: 150 }, { x: 5000, y: 5000 }],
            style: dummyStyle(),
            rounded: false,
        };
        expect(shapeInViewport(shape, viewport)).toBe(true);
    });

    it("text: a point-sized shape, true only when the point itself is in range", () => {
        const inside: Shape = { kind: "text", x: 150, y: 150, text: "hi", fontSize: 10, style: dummyStyle() };
        const outside: Shape = { kind: "text", x: 9000, y: 9000, text: "hi", fontSize: 10, style: dummyStyle() };
        expect(shapeInViewport(inside, viewport)).toBe(true);
        expect(shapeInViewport(outside, viewport)).toBe(false);
    });

    it("cage: true when any segment endpoint falls within range", () => {
        const shape: Shape = {
            kind: "cage",
            segments: [[{ x: 9000, y: 9000 }, { x: 150, y: 150 }]],
            style: dummyStyle(),
        };
        expect(shapeInViewport(shape, viewport)).toBe(true);
    });
});

const dummyStyle = () => ({ stroke: "#000", fill: "none", strokeWidth: 1, dashed: false, opacity: 1, z: 0 });
