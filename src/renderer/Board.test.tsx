// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
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

describe("Board — small puzzles", () => {
    it("still gets the pan/zoom wrapper and toolbar, and renders every cell (no real layout to cull against in this test)", () => {
        const scene = bigScene(9); // 81 cells
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );
        expect(container.querySelector(".board-viewport")).not.toBeNull();
        expect(container.querySelector(".board-zoom-toolbar")).not.toBeNull();
        expect(container.querySelectorAll(".cell-bg").length).toBe(81);
    });

    it("leaves the wrap/viewport box uncapped when jsdom reports a zero-size container (no real layout to measure against)", () => {
        const scene = bigScene(9, 64); // 576x576 at the default cell size
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );
        const wrap = container.querySelector(".board-wrap") as HTMLDivElement;
        const viewport = container.querySelector(".board-viewport") as HTMLDivElement;
        // The initial fit measurement never ran (zero-size rect), so no box size was
        // ever computed — the box stays unsized, same as before any fit happens.
        expect(wrap.style.width).toBe("");
        expect(viewport.style.height).toBe("");
    });
});

/** A mutable stand-in for the measured element's rect — tests mutate `current` and
 * call a ResizeObserver's `.trigger()` (or dispatch a window resize) to force
 * Board.tsx to re-measure, the same way a real layout change would. */
const mutableRect = { left: 0, top: 0, width: 1200, height: 900 };

/** Board.tsx now subtracts the toolbar's own (board-size-independent) height from the
 * fit's height budget (#77 follow-up) — a global getBoundingClientRect stub has to
 * give `.board-zoom-toolbar` a distinct, fixed rect, or it inherits whatever the
 * "measured container" rect is set to in a given test and the budget goes negative.
 * 32px height + Board.tsx's own TOOLBAR_GAP (8px) is baked into every expectation
 * below that depends on the fit's height dimension. */
const TOOLBAR_RECT = { left: 0, top: 0, width: 300, height: 32 };

/** Stubs getBoundingClientRect on every HTMLElement: `.board-zoom-toolbar` always
 * gets TOOLBAR_RECT, everything else (the measured `.board-measure` container, in
 * practice) gets whatever `rectFor` currently resolves to. */
const stubRects = (rectFor: () => { left: number; top: number; width: number; height: number }) => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value: function (this: HTMLElement) {
            const r = this.classList.contains("board-zoom-toolbar") ? TOOLBAR_RECT : rectFor();
            return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON() {} };
        },
    });
};

/** A controllable ResizeObserver stand-in — jsdom has no real one — that lets a test
 * force a re-fit via `.trigger()`. Board.tsx's callback ignores the entry and
 * re-measures via getBoundingClientRect() itself, so the entry argument here is
 * just a placeholder to satisfy the callback's signature. */
class StubResizeObserver {
    static instances: StubResizeObserver[] = [];
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        StubResizeObserver.instances.push(this);
    }
    observe() {}
    disconnect() {}
    trigger() {
        this.callback([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
    }
}

describe("Board — box sizing grows to fill available space (#77 follow-up)", () => {
    // A roomy stand-in for "plenty of screen" — big enough that a small puzzle's
    // fit scale lands comfortably under MAX_ZOOM, so the cap below reflects real
    // growth rather than clamping. window.innerWidth/innerHeight are stubbed
    // generously too, so the window-bounds safety clamp (#77 follow-up — see
    // Board.tsx) never binds here; it has its own dedicated test below.
    beforeAll(() => {
        mutableRect.left = 0;
        mutableRect.top = 0;
        mutableRect.width = 1200;
        mutableRect.height = 900;
        stubRects(() => mutableRect);
        vi.stubGlobal("innerWidth", 3000);
        vi.stubGlobal("innerHeight", 3000);
    });
    afterAll(() => {
        Reflect.deleteProperty(HTMLElement.prototype, "getBoundingClientRect");
        vi.unstubAllGlobals();
    });

    it("sizes the wrap/viewport box at the achieved fit scale, not the raw native size", () => {
        const scene = bigScene(9, 64); // 576x576 native; height is the binding constraint in a 1200x900 container
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );
        const wrap = container.querySelector(".board-wrap") as HTMLDivElement;
        const viewport = container.querySelector(".board-viewport") as HTMLDivElement;
        // height budget = 900 - 32 (toolbar) - 8 (gap) = 860; scale = min(1200/576, 860/576) = 860/576 -> 576 * (860/576) = 860
        expect(wrap.style.width).toBe("860px");
        expect(viewport.style.height).toBe("860px");
    });
});

describe("Board — box size tracks a resizing container (#77 follow-up)", () => {
    beforeAll(() => {
        mutableRect.left = 0;
        mutableRect.top = 0;
        mutableRect.width = 1200;
        mutableRect.height = 900;
        stubRects(() => mutableRect);
        vi.stubGlobal("innerWidth", 3000);
        vi.stubGlobal("innerHeight", 3000);
        vi.stubGlobal("ResizeObserver", StubResizeObserver);
    });
    afterAll(() => {
        Reflect.deleteProperty(HTMLElement.prototype, "getBoundingClientRect");
        vi.unstubAllGlobals();
    });
    beforeEach(() => {
        mutableRect.left = 0;
        mutableRect.top = 0;
        mutableRect.width = 1200;
        mutableRect.height = 900;
    });
    afterEach(() => {
        StubResizeObserver.instances = [];
    });

    it("shrinks the box when its container shrinks (e.g. a devtools panel opening), instead of freezing at the first-mount size", () => {
        const scene = bigScene(9, 64); // 576x576 native
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );
        const wrap = container.querySelector(".board-wrap") as HTMLDivElement;
        const viewport = container.querySelector(".board-viewport") as HTMLDivElement;
        expect(wrap.style.width).toBe("860px"); // first-mount fit, same as the test above

        mutableRect.width = 600;
        mutableRect.height = 450;
        act(() => StubResizeObserver.instances[0].trigger());
        // height budget = 450 - 32 - 8 = 410; scale = min(600/576, 410/576) = 410/576 -> 576 * (410/576) = 410
        expect(wrap.style.width).toBe("410px");
        expect(viewport.style.height).toBe("410px");
    });

    it("doesn't reset the player's own zoom/pan when the container resizes", () => {
        const scene = bigScene(9, 64);
        const { container, getByLabelText } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );
        // 100% always means "whole board visible" (#77 follow-up) — fit-on-mount is
        // exactly that, regardless of the achieved physical box size (860px here).
        expect(container.querySelector(".board-zoom-level")?.textContent).toBe("100%");

        act(() => getByLabelText("Zoom in").click());
        const zoomedLevel = container.querySelector(".board-zoom-level")?.textContent;
        expect(zoomedLevel).not.toBe("100%"); // the player zoomed in by hand

        mutableRect.width = 600;
        mutableRect.height = 450;
        act(() => StubResizeObserver.instances[0].trigger());
        // The container shrank, but the player's chosen zoom level is untouched —
        // only the canvas's own box size (asserted in the test above) changed.
        expect(container.querySelector(".board-zoom-level")?.textContent).toBe(zoomedLevel);
    });
});

describe("Board — fit never exceeds the window's own bounds (#77 follow-up)", () => {
    // Reproduces the actual bug found via a live-logged runaway: something in the
    // real page's flex chain fed the measured container's own on-screen size back
    // into itself, compounding on every resize tick. Simulate that directly — the
    // "measured" rect claims to be bigger than the window — and assert the fit
    // clamps to the window instead of trusting it.
    beforeAll(() => {
        stubRects(() => ({ left: 0, top: 0, width: 5000, height: 5000 }));
        vi.stubGlobal("innerWidth", 1000);
        vi.stubGlobal("innerHeight", 800);
    });
    afterAll(() => {
        Reflect.deleteProperty(HTMLElement.prototype, "getBoundingClientRect");
        vi.unstubAllGlobals();
    });

    it("clamps the box to the window's bounds instead of a wildly oversized measured rect", () => {
        const scene = bigScene(9, 64); // 576x576 native
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );
        const wrap = container.querySelector(".board-wrap") as HTMLDivElement;
        const viewport = container.querySelector(".board-viewport") as HTMLDivElement;
        // available = min(5000, 1000-0-16)=984 wide, min(5000, 800-0-16)=784 tall
        // height budget = 784 - 32 (toolbar) - 8 (gap) = 744
        // scale = min(984/576, 744/576) = 744/576 = 1.2917 -> clamped by MAX_ZOOM? no, < 3
        const expected = Math.round(576 * (744 / 576) * 1000) / 1000;
        expect(parseFloat(wrap.style.width)).toBeCloseTo(expected, 0);
        expect(parseFloat(viewport.style.height)).toBeCloseTo(expected, 0);
        expect(parseFloat(wrap.style.width)).toBeLessThan(1000); // never exceeds the window, unlike the raw 5000px rect
    });
});

/** `viewBox="left top width height"` -> numbers, for asserting on the pan/zoom state. */
const readViewBox = (svg: SVGSVGElement): { left: number; top: number; width: number; height: number } => {
    const [left, top, width, height] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
    return { left, top, width, height };
};

describe("Board — large puzzles", () => {
    // jsdom reports all-zero rects by default (no real layout); stub a fixed
    // 100x100 container so the pan/zoom math has something realistic to work with.
    // (Pan/zoom interactions re-measure .board-viewport directly at the time of the
    // interaction, so they see 100x100 regardless of the toolbar subtraction below —
    // only the *initial* fit-on-mount scale, which goes through .board-measure minus
    // the toolbar, is affected: height budget 100 - 32 - 8 = 60, not 100.)
    beforeAll(() => {
        stubRects(() => ({ left: 0, top: 0, width: 100, height: 100 }));
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
        // 100% always means "whole board visible" (#77 follow-up), regardless of the
        // achieved physical scale (which here works out to a tiny 12%-of-native size).
        expect(container.querySelector(".board-zoom-level")?.textContent).toBe("100%");
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

        // 100% always means "whole board visible" (#77 follow-up) — fit-on-mount is
        // exactly that, regardless of the achieved physical scale.
        expect(level()).toBe("100%");

        act(() => getByLabelText("Zoom in").click());
        // view.width 500 -> 500/ZOOM_STEP = 400 (board units); % = scene.width/view.width*100 = 500/400*100
        expect(level()).toBe("125%");

        act(() => getByLabelText("Reset to actual size (1 board unit per pixel)").click());
        // "Actual size" sets view.width = the container's own pixel width (100) — a
        // *different*, independently useful zoom level from "fit" (#77 follow-up), so
        // it no longer displays as "100%" now that 100% is reserved for "whole board
        // visible": % = scene.width/view.width*100 = 500/100*100 = 500%.
        expect(level()).toBe("500%");
        expect(readViewBox(svg).width).toBeCloseTo(100); // 1 board unit per pixel, in a 100px container

        act(() => getByLabelText("Fit whole board to screen").click());
        expect(level()).toBe("100%"); // fit is always 100%, same as fit-on-mount
        expect(readViewBox(svg)).toEqual({ left: 0, top: 0, width: 500, height: 500 });

        act(() => getByLabelText("Zoom out").click());
        // view.width 500 -> 500*ZOOM_STEP = 625; % = 500/625*100 = 80
        expect(level()).toBe("80%");
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
        expect(slider.value).toBe("100"); // fit-on-mount is always 100% (#77 follow-up)

        act(() => fireEvent.change(slider, { target: { value: "150" } }));
        expect(level()).toBe("150%");
        // 150% of *the board*, not of the container (#77 follow-up): targetWidth =
        // scene.width*100/150 = 333.33 board units visible.
        expect(readViewBox(svg).width).toBeCloseTo(500 / 1.5);

        // Zooming via the slider stays centered on the current view, same as the +/- buttons.
        expect(readViewBox(svg).left + readViewBox(svg).width / 2).toBeCloseTo(250);
    });
});
