// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

import Board from "@/renderer/Board.tsx";
import type { CellShape, Scene } from "@/renderer/scene.ts";

afterEach(cleanup);

const noop = () => undefined;

/** A hand-built N x N scene — avoids needing a compiled puzzle just to get cell shapes. */
const bigScene = (n: number, cellSize = 20): Scene => {
    const cells: CellShape[] = [];
    for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
            cells.push({
                cell: `r${row + 1}c${col + 1}`,
                x: col * cellSize,
                y: row * cellSize,
                size: cellSize,
                tone: "normal",
                ring: null,
                value: null,
                given: false,
                notes: [],
                centerNotes: [],
                flagged: false,
            });
        }
    }
    return {
        width: n * cellSize,
        height: n * cellSize,
        viewBox: `0 0 ${n * cellSize} ${n * cellSize}`,
        cellSize,
        cells,
        gridLines: [],
        shapes: [],
    };
};

describe("Board — small puzzles (below the virtualization threshold)", () => {
    it("renders every cell directly, with no scrollable wrapper", () => {
        const scene = bigScene(9); // 81 cells
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );
        expect(container.querySelector(".board-viewport")).toBeNull();
        expect(container.querySelectorAll(".cell-bg").length).toBe(81);
    });
});

/** `viewBox="left top width height"` -> numbers, for asserting on the pan/zoom state. */
const readViewBox = (svg: SVGSVGElement): { left: number; top: number; width: number; height: number } => {
    const [left, top, width, height] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
    return { left, top, width, height };
};

describe("Board — large puzzles (above the virtualization threshold)", () => {
    // jsdom reports all-zero rects by default (no real layout); stub a fixed
    // 100x100 container so the pan/zoom math has something realistic to work with.
    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
            configurable: true,
            value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, toJSON() {} }),
        });
    });
    afterAll(() => {
        Reflect.deleteProperty(HTMLElement.prototype, "getBoundingClientRect");
    });

    it("wraps the board in a pannable/zoomable viewport, and culls offscreen cells once zoomed in", () => {
        const scene = bigScene(25); // 625 cells, well above the 400 threshold
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );

        const viewport = container.querySelector(".board-viewport");
        expect(viewport).not.toBeNull();
        // The default view is a full overview — "see the whole puzzle" is the point — so
        // nothing is culled yet; every cell is still on-screen (if tiny).
        expect(container.querySelectorAll(".cell-bg").length).toBe(625);

        act(() => {
            viewport!.dispatchEvent(new WheelEvent("wheel", { deltaY: -300, clientX: 50, clientY: 50, bubbles: true }));
        });
        const rendered = container.querySelectorAll(".cell-bg").length;
        expect(rendered).toBeGreaterThan(0);
        expect(rendered).toBeLessThan(625); // zoomed in -> culled, not every cell made it into the DOM
    });

    it("starts showing the whole board (a 'full view', not a corner at 1:1)", () => {
        const scene = bigScene(25, 20); // 500x500 board, in a stubbed 100x100 container
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );

        const svg = container.querySelector("svg.board") as SVGSVGElement;
        expect(svg.getAttribute("width")).toBe("100%");
        expect(readViewBox(svg)).toEqual({ left: 0, top: 0, width: 500, height: 500 });
        expect(container.querySelector(".board-zoom-level")?.textContent).toBe("20%");
    });

    it("zooms toward the cursor on wheel, and pans on a middle/right-button drag", () => {
        const scene = bigScene(25, 20); // 500x500 board
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );

        const svg = container.querySelector("svg.board") as SVGSVGElement;
        const viewport = container.querySelector(".board-viewport") as HTMLDivElement;

        // Zoom in (negative deltaY) centered on the container's middle (50, 50 of a 100x100 rect).
        act(() => {
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: 50, clientY: 50, bubbles: true }));
        });
        const afterZoom = readViewBox(svg);
        expect(afterZoom.width).toBeLessThan(500); // zoomed in -> less of the board visible
        // The board-unit point under the cursor (board center, 250/250) stays centered.
        expect(afterZoom.left + afterZoom.width / 2).toBeCloseTo(250);

        // Pan via a middle-button drag. jsdom has no PointerEvent constructor, but React's
        // onPointer* handlers just listen for the native event *type* ("pointerdown" etc.)
        // and read standard MouseEvent fields (button/clientX/clientY) off it — so a plain
        // MouseEvent dispatched under that type name is caught the same way.
        act(() => {
            viewport.dispatchEvent(new MouseEvent("pointerdown", { button: 1, clientX: 50, clientY: 50, bubbles: true }));
            viewport.dispatchEvent(new MouseEvent("pointermove", { button: 1, clientX: 60, clientY: 50, bubbles: true }));
            viewport.dispatchEvent(new MouseEvent("pointerup", { button: 1, clientX: 60, clientY: 50, bubbles: true }));
        });
        const afterPan = readViewBox(svg);
        expect(afterPan.left).toBeLessThan(afterZoom.left); // dragged right -> view shifts left
    });

    it("shows a zoom toolbar that zooms in/out, resets to 100%, and fits to screen", () => {
        const scene = bigScene(25, 20); // 500x500 board
        const { container, getByLabelText } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );

        const svg = container.querySelector("svg.board") as SVGSVGElement;
        const level = () => container.querySelector(".board-zoom-level")?.textContent;

        expect(level()).toBe("20%"); // fit-on-mount, as above

        act(() => getByLabelText("Zoom in").click());
        expect(level()).toBe("25%"); // 20% * 1.25

        act(() => getByLabelText("Reset zoom to 100%").click());
        expect(level()).toBe("100%");
        expect(readViewBox(svg).width).toBeCloseTo(100); // 1 board unit per pixel, in a 100px container

        act(() => getByLabelText("Fit whole board to screen").click());
        expect(level()).toBe("20%");
        expect(readViewBox(svg)).toEqual({ left: 0, top: 0, width: 500, height: 500 });

        act(() => getByLabelText("Zoom out").click());
        expect(level()).toBe("16%"); // 20% / 1.25
    });

    it("has a draggable zoom slider that sets a precise level, centered on the current view", () => {
        const scene = bigScene(25, 20); // 500x500 board
        const { container, getByLabelText } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );

        const svg = container.querySelector("svg.board") as SVGSVGElement;
        const level = () => container.querySelector(".board-zoom-level")?.textContent;
        const slider = getByLabelText("Zoom level") as HTMLInputElement;

        expect(slider.min).toBe("2"); // MIN_ZOOM * 100
        expect(slider.max).toBe("300"); // MAX_ZOOM * 100
        expect(slider.value).toBe("20"); // matches the fit-on-mount level

        act(() => fireEvent.change(slider, { target: { value: "150" } }));
        expect(level()).toBe("150%");
        expect(readViewBox(svg).width).toBeCloseTo(100 / 1.5); // 150% of a 100px container

        // Zooming via the slider stays centered on the current view, same as the +/- buttons.
        expect(readViewBox(svg).left + readViewBox(svg).width / 2).toBeCloseTo(250);
    });
});
