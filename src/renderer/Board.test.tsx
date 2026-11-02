// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

import Board from "@/renderer/Board.tsx";
import type { CellShape, Scene } from "@/renderer/scene.ts";

afterEach(() => {
    cleanup();
    localStorage.clear();
});

const noop = () => undefined;

/** A hand-built N x N scene. It avoids the need for a compiled puzzle just to get cell shapes. */
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
                incorrect: false,
                hidden: false,
                sameValue: false,
                marks: [],
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
        selectionOutline: [],
        origin: { x: 0, y: 0 },
        pen: [],
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
        // ever computed. The box stays unsized, as before any fit happens.
        expect(wrap.style.width).toBe("");
        expect(viewport.style.height).toBe("");
    });
});

describe("Board — checkAgainstSolution's incorrect marker (#52 follow-up)", () => {
    it("draws a diagonal slash through a value flagged incorrect, not a line-through", () => {
        const scene = bigScene(1);
        scene.cells[0] = { ...scene.cells[0], value: 4, incorrect: true };
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );
        expect(container.querySelector(".digit.incorrect")).not.toBeNull();
        expect(container.querySelector(".incorrect-slash")).not.toBeNull();
    });

    it("draws no slash for a value that isn't flagged incorrect", () => {
        const scene = bigScene(1);
        scene.cells[0] = { ...scene.cells[0], value: 4, incorrect: false };
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );
        expect(container.querySelector(".incorrect-slash")).toBeNull();
    });
});

/** A mutable stand-in for the rect of the measured element. Tests change `current` and
 * call `.trigger()` of a ResizeObserver (or dispatch a window resize) to force
 * Board.tsx to re-measure, as a real layout change would. */
const mutableRect = { left: 0, top: 0, width: 1200, height: 900 };

/** Board.tsx subtracts the own height of the footer row (it does not depend on the board size) from the
 * height budget of the fit. A global getBoundingClientRect stub must give `.board-footer` a
 * distinct, fixed rect. Otherwise it gets the rect of the "measured container" in a
 * given test, and the budget goes negative. 44px + FOOTER_GAP of Board.tsx (8px) is part of
 * every expectation below that depends on the height dimension of the fit. */
const FOOTER_RECT = { left: 0, top: 0, width: 300, height: 44 };

/** Stubs getBoundingClientRect on every HTMLElement. `.board-footer` always gets
 * FOOTER_RECT. Everything else (in practice the measured `.board-measure` container)
 * gets what `rectFor` resolves to at that time. */
const stubRects = (rectFor: () => { left: number; top: number; width: number; height: number }) => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value: function (this: HTMLElement) {
            const r = this.classList.contains("board-footer") ? FOOTER_RECT : rectFor();
            return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON() {} };
        },
    });
};

/** A controllable stand-in for ResizeObserver (jsdom has no real one). It lets a test
 * force a re-fit through `.trigger()`. The callback of Board.tsx ignores the entry and
 * re-measures through getBoundingClientRect() itself. So the entry argument here is
 * only a placeholder for the signature of the callback. */
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
    // A roomy stand-in for "plenty of screen". It is big enough that the fit scale of a small puzzle
    // lands well under MAX_ZOOM, so the cap below reflects real growth and not clamping.
    // window.innerWidth/innerHeight are stubbed large too, so the safety clamp
    // to the window bounds (#77 follow-up, see Board.tsx) never binds here.
    // It has its own test below.
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
        const scene = bigScene(9, 64); // 576x576 native. Height is the binding constraint in a 1200x900 container
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );
        const wrap = container.querySelector(".board-wrap") as HTMLDivElement;
        const viewport = container.querySelector(".board-viewport") as HTMLDivElement;
        // height budget = 900 - 44 (footer row) - 8 (gap) = 848; scale = min(1200/576, 848/576) -> 848
        expect(wrap.style.width).toBe("848px");
        expect(viewport.style.height).toBe("848px");
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
        expect(wrap.style.width).toBe("848px"); // first-mount fit, as in the test above

        mutableRect.width = 600;
        mutableRect.height = 450;
        act(() => StubResizeObserver.instances[0].trigger());
        // height budget = 450 - 44 - 8 = 398; scale = min(600/576, 398/576) -> 398
        expect(wrap.style.width).toBe("398px");
        expect(viewport.style.height).toBe("398px");
    });

    it("doesn't reset the player's own zoom/pan when the container resizes", () => {
        const scene = bigScene(9, 64);
        const { container, getByLabelText } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );
        // 100% always means "whole board visible" (#77 follow-up). Fit-on-mount is
        // exactly that, whatever the achieved physical box size (848px here).
        expect(container.querySelector(".board-zoom-level")?.textContent).toBe("100%");

        act(() => getByLabelText("Zoom in").click());
        const zoomedLevel = container.querySelector(".board-zoom-level")?.textContent;
        expect(zoomedLevel).not.toBe("100%"); // the player zoomed in by hand

        mutableRect.width = 600;
        mutableRect.height = 450;
        act(() => StubResizeObserver.instances[0].trigger());
        // The container shrank, but the zoom level chosen by the player is unchanged.
        // Only the box size of the canvas changed (asserted in the test above).
        expect(container.querySelector(".board-zoom-level")?.textContent).toBe(zoomedLevel);
    });
});

describe("Board — fit never exceeds the window's own bounds (#77 follow-up)", () => {
    // Reproduces the real bug found with a live-logged runaway. Something in the
    // flex chain of the real page fed the on-screen size of the measured container back
    // into itself. It compounded on every resize tick. Simulate that directly:
    // the "measured" rect claims to be bigger than the window. Assert that the fit
    // clamps to the window and does not trust the rect.
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
        // height budget = 784 - 44 (footer row) - 8 (gap) = 732
        // scale = min(984/576, 744/576) = 744/576 = 1.2917 -> clamped by MAX_ZOOM? no, < 3
        const expected = Math.round(576 * (732 / 576) * 1000) / 1000;
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

describe("Board — zoom controls popover", () => {
    it("keeps the controls out of the way until the zoom button is pressed", () => {
        const { container, getByRole } = render(
            <Board scene={bigScene(9, 64)} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );
        const panel = container.querySelector(".board-zoom-toolbar") as HTMLElement;
        const toggle = getByRole("button", { name: /Zoom controls/ });
        expect(panel.hidden).toBe(true);
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        act(() => toggle.click());
        expect(panel.hidden).toBe(false);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        act(() => {
            panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        });
        expect(panel.hidden).toBe(true);
    });
});

describe("Board — large puzzles", () => {
    // jsdom reports all-zero rects by default (no real layout). Stub a fixed
    // 100x100 container so the pan/zoom math has realistic input.
    // (Pan/zoom interactions re-measure .board-viewport directly when they happen,
    // so they see 100x100.)
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
        // The default view is a full overview ("see the whole puzzle" is the point), so
        // nothing is culled yet. Every cell is still on-screen (if tiny).
        expect(container.querySelectorAll(".cell-bg").length).toBe(625);

        act(() => {
            viewport!.dispatchEvent(new WheelEvent("wheel", { deltaY: -300, clientX: 50, clientY: 50, bubbles: true }));
        });
        const rendered = container.querySelectorAll(".cell-bg").length;
        expect(rendered).toBeGreaterThan(0);
        expect(rendered).toBeLessThan(625); // zoomed in -> culled, so not every cell is in the DOM
    });

    it("starts showing the whole board (a 'full view', not a corner at 1:1)", () => {
        const scene = bigScene(25, 20); // 500x500 board, in a stubbed 100x100 container
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );

        const svg = container.querySelector("svg.board") as SVGSVGElement;
        expect(svg.getAttribute("width")).toBe("100%");
        expect(readViewBox(svg)).toEqual({ left: 0, top: 0, width: 500, height: 500 });
        // 100% always means "whole board visible" (#77 follow-up), whatever the
        // achieved physical scale (here it is a tiny 12% of native size).
        expect(container.querySelector(".board-zoom-level")?.textContent).toBe("100%");
    });

    it("zooms toward the cursor on wheel, and pans on a middle/right-button drag", () => {
        const scene = bigScene(25, 20); // 500x500 board
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );

        const svg = container.querySelector("svg.board") as SVGSVGElement;
        const viewport = container.querySelector(".board-viewport") as HTMLDivElement;

        // Zoom in (negative deltaY) centered on the middle of the container (50, 50 of a 100x100 rect).
        act(() => {
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: 50, clientY: 50, bubbles: true }));
        });
        const afterZoom = readViewBox(svg);
        expect(afterZoom.width).toBeLessThan(500); // zoomed in -> less of the board visible
        // The board-unit point under the cursor (board center, 250/250) stays centered.
        expect(afterZoom.left + afterZoom.width / 2).toBeCloseTo(250);

        // Pan with a middle-button drag. jsdom has no PointerEvent constructor, but the React
        // onPointer* handlers only listen for the native event *type* ("pointerdown" etc.)
        // and read standard MouseEvent fields (button/clientX/clientY) from it.
        // So a plain MouseEvent sent under that type name is caught the same way.
        act(() => {
            viewport.dispatchEvent(new MouseEvent("pointerdown", { button: 1, clientX: 50, clientY: 50, bubbles: true }));
            viewport.dispatchEvent(new MouseEvent("pointermove", { button: 1, clientX: 60, clientY: 50, bubbles: true }));
            viewport.dispatchEvent(new MouseEvent("pointerup", { button: 1, clientX: 60, clientY: 50, bubbles: true }));
        });
        const afterPan = readViewBox(svg);
        expect(afterPan.left).toBeLessThan(afterZoom.left); // dragged right -> view shifts left
    });

    // jsdom has no PointerEvent constructor (see the comment above). Unlike the standard
    // button/clientX/clientY of MouseEventInit, pointerId/pointerType are not
    // part of it. So they are attached after construction instead.
    const touchPointer = (
        type: string,
        pointerId: number,
        x: number,
        y: number,
    ): MouseEvent => {
        const e = new MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true });
        Object.defineProperty(e, "pointerId", { value: pointerId, configurable: true });
        Object.defineProperty(e, "pointerType", { value: "touch", configurable: true });
        return e;
    };

    it("pans and pinch-zooms on a two-finger touch drag, since touch has no middle/right button", () => {
        const scene = bigScene(25, 20); // 500x500 board
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );

        const svg = container.querySelector("svg.board") as SVGSVGElement;
        const viewport = container.querySelector(".board-viewport") as HTMLDivElement;
        const before = readViewBox(svg);

        act(() => {
            // Two fingers come down 20px apart, centered on (50, 50)...
            viewport.dispatchEvent(touchPointer("pointerdown", 1, 40, 50));
            viewport.dispatchEvent(touchPointer("pointerdown", 2, 60, 50));
            // ...the first move only sets the anchor (no jump at gesture start)...
            viewport.dispatchEvent(touchPointer("pointermove", 1, 40, 50));
            viewport.dispatchEvent(touchPointer("pointermove", 2, 60, 50));
            // ...then spread apart (pinch out -> zoom in) and slide right (pan) at the same time.
            viewport.dispatchEvent(touchPointer("pointermove", 1, 55, 50));
            viewport.dispatchEvent(touchPointer("pointermove", 2, 95, 50));
            viewport.dispatchEvent(touchPointer("pointerup", 1, 55, 50));
            viewport.dispatchEvent(touchPointer("pointerup", 2, 95, 50));
        });

        const after = readViewBox(svg);
        expect(after.width).toBeLessThan(before.width); // fingers spread apart -> zoomed in
        expect(after.left).toBeGreaterThan(before.left); // midpoint slid right -> view shifts right
    });

    it("doesn't let a second finger landing on a cell also start/extend a selection drag", () => {
        const scene = bigScene(25, 20); // 500x500 board
        const onPaintStart = vi.fn();
        const onPaintMove = vi.fn();
        const { container } = render(
            <Board scene={scene} onPaintStart={onPaintStart} onPaintMove={onPaintMove} onPaintEnd={noop} onClearSelection={noop} />,
        );

        const cells = container.querySelectorAll(".cell-bg");
        const firstCell = cells[0] as SVGRectElement;
        const secondCell = cells[1] as SVGRectElement;
        const thirdCell = cells[2] as SVGRectElement;

        act(() => {
            // First finger taps a cell -> normal single-touch selection starts...
            firstCell.dispatchEvent(touchPointer("pointerdown", 1, 10, 10));
        });
        expect(onPaintStart).toHaveBeenCalledTimes(1);

        act(() => {
            // ...then a second finger comes down on another cell -> this is a
            // pinch/pan gesture, not a second paint-start on that cell.
            secondCell.dispatchEvent(touchPointer("pointerdown", 2, 60, 50));
        });
        expect(onPaintStart).toHaveBeenCalledTimes(1);

        act(() => {
            // The finger that slides into a third cell would normally extend the
            // selection (handleCellEnter). The onPointerEnter of React is built on the
            // native "pointerover" event, so that is what is dispatched here.
            thirdCell.dispatchEvent(touchPointer("pointerover", 1, 15, 10));
        });
        // Selection painting was cancelled when the second finger landed. So the first
        // finger does not extend the selection when it continues to move.
        expect(onPaintMove).not.toHaveBeenCalled();
    });

    it("shows a zoom toolbar that zooms in/out, resets to 100%, and fits to screen", () => {
        const scene = bigScene(25, 20); // 500x500 board
        const { container, getByLabelText } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );

        const svg = container.querySelector("svg.board") as SVGSVGElement;
        const level = () => container.querySelector(".board-zoom-level")?.textContent;

        // 100% always means "whole board visible" (#77 follow-up). Fit-on-mount is
        // exactly that, whatever the achieved physical scale.
        expect(level()).toBe("100%");

        act(() => getByLabelText("Zoom in").click());
        // view.width 500 -> 500/ZOOM_STEP = 400 (board units); % = scene.width/view.width*100 = 500/400*100
        expect(level()).toBe("125%");

        act(() => getByLabelText("Reset to actual size (1 board unit per pixel)").click());
        // "Actual size" sets view.width = the own pixel width of the container (100). This is a
        // *different* zoom level from "fit", and it is useful by itself (#77 follow-up).
        // So it no longer displays as "100%", because 100% is now reserved for "whole board
        // visible": % = scene.width/view.width*100 = 500/100*100 = 500%.
        expect(level()).toBe("500%");
        expect(readViewBox(svg).width).toBeCloseTo(100); // 1 board unit per pixel, in a 100px container

        act(() => getByLabelText("Fit whole board to screen").click());
        expect(level()).toBe("100%"); // fit is always 100%, as with fit-on-mount
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

        // The slider zoom stays centered on the current view, as the +/- buttons do.
        expect(readViewBox(svg).left + readViewBox(svg).width / 2).toBeCloseTo(250);
    });

    it("locks the zoom level (wheel, buttons, slider, Fit, Actual size all no-op) while still allowing pan", () => {
        const scene = bigScene(25, 20); // 500x500 board
        const { container, getByLabelText } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );
        const svg = container.querySelector("svg.board") as SVGSVGElement;
        const viewport = container.querySelector(".board-viewport") as HTMLDivElement;
        const level = () => container.querySelector(".board-zoom-level")?.textContent;

        // Zoom in first, so there is room to pan once locked. In the full-scene "fit"
        // view, left/top are already clamped to 0, so there is nothing to pan into.
        act(() => getByLabelText("Zoom in").click());
        const zoomedLevel = level();
        const zoomedView = readViewBox(svg);

        act(() => getByLabelText("Lock zoom at its current level").click());

        expect((getByLabelText("Zoom in") as HTMLButtonElement).disabled).toBe(true);
        expect((getByLabelText("Zoom out") as HTMLButtonElement).disabled).toBe(true);
        expect((getByLabelText("Zoom level") as HTMLInputElement).disabled).toBe(true);
        expect((getByLabelText("Fit whole board to screen") as HTMLButtonElement).disabled).toBe(true);
        expect((getByLabelText("Reset to actual size (1 board unit per pixel)") as HTMLButtonElement).disabled).toBe(true);

        act(() => getByLabelText("Zoom in").click());
        expect(level()).toBe(zoomedLevel); // disabled buttons do not fire; check that the handler does nothing too
        act(() => {
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -300, clientX: 50, clientY: 50, bubbles: true }));
        });
        expect(level()).toBe(zoomedLevel);
        expect(readViewBox(svg)).toEqual(zoomedView);

        // Panning still works while locked.
        act(() => {
            viewport.dispatchEvent(new MouseEvent("pointerdown", { button: 1, clientX: 50, clientY: 50, bubbles: true }));
            viewport.dispatchEvent(new MouseEvent("pointermove", { button: 1, clientX: 60, clientY: 50, bubbles: true }));
            viewport.dispatchEvent(new MouseEvent("pointerup", { button: 1, clientX: 60, clientY: 50, bubbles: true }));
        });
        expect(readViewBox(svg).left).toBeLessThan(zoomedView.left); // dragged right -> view shifts left
        expect(level()).toBe(zoomedLevel); // panning does not change the zoom level

        // Unlocking restores normal zoom behavior.
        act(() => getByLabelText("Unlock zoom (currently locked)").click());
        expect((getByLabelText("Zoom in") as HTMLButtonElement).disabled).toBe(false);
        act(() => getByLabelText("Zoom in").click());
        expect(level()).not.toBe(zoomedLevel);
    });
});

describe("Board — pen input (#45)", () => {
    // jsdom has no PointerEvent, so fireEvent.pointerX would drop the coordinates and button.
    beforeAll(() => {
        if (!("PointerEvent" in window)) {
            Object.defineProperty(window, "PointerEvent", { value: class extends MouseEvent {}, configurable: true });
        }
    });

    const penBoard = (segments: readonly string[] = []) => {
        const onStroke = vi.fn();
        const onMark = vi.fn();
        const scene = bigScene(4, 20); // 80x80, cells 20px
        const { container } = render(
            <Board
                scene={scene}
                pen={{ segments, onStroke, onMark }}
                onPaintStart={noop}
                onPaintMove={noop}
                onPaintEnd={noop}
                onClearSelection={noop}
            />,
        );
        const svg = container.querySelector("svg.board") as SVGSVGElement;
        // jsdom does no layout. Pretend that the 80x80 board fills an 80x80 box at the origin.
        svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 80, height: 80 }) as DOMRect;
        const surface = container.querySelector(".pen-surface") as SVGRectElement;
        return { surface, onStroke, onMark, container };
    };

    it("draws a stroke along the half-cell lattice when dragged, instead of selecting cells", () => {
        const { surface, onStroke } = penBoard();
        fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, button: 0 });
        fireEvent.pointerMove(surface, { clientX: 30, clientY: 10 });
        fireEvent.pointerUp(surface, { clientX: 30, clientY: 10 });
        expect(onStroke).toHaveBeenCalledTimes(1);
        const points = onStroke.mock.calls[0]![0] as { x: number; y: number }[];
        expect(points[0]).toEqual({ x: 1, y: 1 });
        expect(points[points.length - 1]).toEqual({ x: 3, y: 1 });
    });

    it("previews a stroke over existing lines as a removal, and an ordinary one as a draft", () => {
        const { surface, container } = penBoard(["1,1|2,1", "2,1|3,1"]);
        fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, button: 0 });
        fireEvent.pointerMove(surface, { clientX: 30, clientY: 10 });
        expect(container.querySelectorAll(".pen-erasing").length).toBe(2);
        expect(container.querySelector(".pen-draft")).toBeNull();
        // a drag past the end of the existing line makes it a normal stroke again
        fireEvent.pointerMove(surface, { clientX: 50, clientY: 10 });
        expect(container.querySelector(".pen-erasing")).toBeNull();
        expect(container.querySelector(".pen-draft")).not.toBeNull();
    });

    it("treats a click that stays on one lattice point as a mark there, not a stroke", () => {
        const { surface, onMark, onStroke } = penBoard();
        fireEvent.pointerDown(surface, { clientX: 41, clientY: 19, button: 0 });
        fireEvent.pointerMove(surface, { clientX: 42, clientY: 21 }); // a little jitter, same point
        fireEvent.pointerUp(surface, { clientX: 41, clientY: 19 });
        expect(onMark).toHaveBeenCalledWith({ x: 4, y: 2 });
        expect(onStroke).not.toHaveBeenCalled();
    });

    it("has no pen surface when the pen isn't active", () => {
        const { container } = render(
            <Board scene={bigScene(2)} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );
        expect(container.querySelector(".pen-surface")).toBeNull();
    });
});
