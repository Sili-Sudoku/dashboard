import { describe, expect, it } from "vitest";
import {
    cellInViewport,
    clamp,
    clampView,
    expandViewport,
    fitView,
    lineInViewport,
    MAX_ZOOM,
    MIN_ZOOM,
    panView,
    shapeInViewport,
    zoomViewAt,
    type ViewportRect,
} from "@/renderer/virtualize.ts";
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

describe("clamp", () => {
    it("passes values through untouched when already in range", () => {
        expect(clamp(1.5, 0.1, 3)).toBe(1.5);
    });

    it("floors to min and ceils to max", () => {
        expect(clamp(0.001, 0.1, 3)).toBe(0.1);
        expect(clamp(10, 0.1, 3)).toBe(3);
    });
});

describe("fitView", () => {
    it("centers a view rect matching the container's aspect ratio over the whole scene", () => {
        // 1000x500 scene in a 500x500 container: width is the binding constraint (scale 0.5),
        // so the view must be 1000x1000 board units, letterboxed (centered) over the scene's height.
        expect(fitView(1000, 500, 500, 500)).toEqual({ left: 0, top: -250, width: 1000, height: 1000 });
    });

    it("clamps to MIN_ZOOM for a board far larger than the container", () => {
        const view = fitView(1_000_000, 1_000_000, 100, 100);
        expect(view.width).toBe(100 / MIN_ZOOM);
    });

    it("clamps to MAX_ZOOM for a board far smaller than the container", () => {
        const view = fitView(10, 10, 100_000, 100_000);
        expect(view.width).toBe(100_000 / MAX_ZOOM);
    });
});

describe("clampView", () => {
    it("leaves a view inside the scene untouched", () => {
        const view: ViewportRect = { left: 50, top: 50, width: 100, height: 100 };
        expect(clampView(view, 1000, 1000)).toEqual(view);
    });

    it("pulls a view back so it still overlaps the scene when dragged past the edge", () => {
        const view: ViewportRect = { left: -500, top: -500, width: 100, height: 100 };
        expect(clampView(view, 1000, 1000)).toEqual({ left: 0, top: 0, width: 100, height: 100 });
    });

    it("keeps a zoomed-out (larger-than-scene) view within [scene-width, 0] bounds", () => {
        const view: ViewportRect = { left: 999, top: -5000, width: 2000, height: 2000 };
        expect(clampView(view, 1000, 1000)).toEqual({ left: 0, top: -1000, width: 2000, height: 2000 });
    });
});

describe("panView", () => {
    it("shifts the view by the given board-unit delta", () => {
        const view: ViewportRect = { left: 100, top: 100, width: 200, height: 200 };
        expect(panView(view, 1000, 1000, 10, -10)).toEqual({ left: 110, top: 90, width: 200, height: 200 });
    });

    it("clamps the result so panning can't lose the scene entirely", () => {
        const view: ViewportRect = { left: 0, top: 0, width: 200, height: 200 };
        expect(panView(view, 1000, 1000, -500, 0)).toEqual({ left: 0, top: 0, width: 200, height: 200 });
    });
});

describe("zoomViewAt", () => {
    it("keeps the anchor point (board-unit) stationary on screen when zooming in", () => {
        const view: ViewportRect = { left: 0, top: 0, width: 400, height: 400 };
        // Anchor at the exact center (fracX/Y = 0.5): board-unit (200,200) before and after.
        const next = zoomViewAt(view, 1000, 1000, 100, 0.5, 0.5, 2); // zoom in 2x -> half the width/height
        expect(next.width).toBe(200);
        expect(next.height).toBe(200);
        expect(next.left + 0.5 * next.width).toBeCloseTo(200);
        expect(next.top + 0.5 * next.height).toBeCloseTo(200);
    });

    it("zooming out (factor < 1) grows the view", () => {
        const view: ViewportRect = { left: 400, top: 400, width: 200, height: 200 };
        const next = zoomViewAt(view, 1000, 1000, 100, 0.5, 0.5, 0.5);
        expect(next.width).toBe(400);
        expect(next.height).toBe(400);
    });

    it("respects MIN_ZOOM/MAX_ZOOM bounds (relative to container pixels) via width clamping", () => {
        const view: ViewportRect = { left: 0, top: 0, width: 400, height: 400 };
        const zoomedInHard = zoomViewAt(view, 1000, 1000, 1000, 0, 0, 1000);
        expect(zoomedInHard.width).toBeCloseTo(1000 / MAX_ZOOM);

        const zoomedOutHard = zoomViewAt(view, 1000, 1000, 1000, 0, 0, 0.0001);
        expect(zoomedOutHard.width).toBeCloseTo(1000 / MIN_ZOOM);
    });
});
