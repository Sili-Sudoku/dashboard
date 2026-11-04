// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

import Board from "@/renderer/Board.tsx";
import type { CellShape, Scene } from "@/renderer/scene.ts";

// jsdom has no PointerEvent, so fireEvent.pointerX would drop the button and modifier keys.
beforeAll(() => {
    if (!("PointerEvent" in window)) {
        Object.defineProperty(window, "PointerEvent", { value: class extends MouseEvent {}, configurable: true });
    }
});

afterEach(() => {
    cleanup();
    localStorage.clear();
});

const noop = () => undefined;

const cellAt = (row: number, col: number, size: number, patch: Partial<CellShape> = {}): CellShape => ({
    cell: `r${row}c${col}`,
    x: (col - 1) * size,
    y: (row - 1) * size,
    size,
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
    ...patch,
});

/** A 2x2 scene. `patch` changes one cell by id. */
const scene2 = (patches: Record<string, Partial<CellShape>> = {}): Scene => {
    const size = 40;
    const cells = [cellAt(1, 1, size), cellAt(1, 2, size), cellAt(2, 1, size), cellAt(2, 2, size)].map((c) => ({
        ...c,
        ...patches[c.cell],
    }));
    return {
        width: 80,
        height: 80,
        viewBox: "0 0 80 80",
        cellSize: size,
        cells,
        gridLines: [],
        shapes: [],
        selectionOutline: [],
        origin: { x: 0, y: 0 },
        pen: [],
    };
};

const renderBoard = (scene: Scene, props: Partial<React.ComponentProps<typeof Board>> = {}) =>
    render(
        <Board
            scene={scene}
            onPaintStart={noop}
            onPaintMove={noop}
            onPaintEnd={noop}
            onClearSelection={noop}
            {...props}
        />,
    );

describe("Board — cell layers", () => {
    it("gives each cell a background carrying its tone", () => {
        const { container } = renderBoard(scene2({ r1c1: { tone: "violated" }, r2c2: { tone: "invalid" } }));
        const bgs = [...container.querySelectorAll(".cell-bg")].map((el) => el.getAttribute("class"));
        expect(bgs).toEqual([
            "cell-bg cell-violated",
            "cell-bg cell-normal",
            "cell-bg cell-normal",
            "cell-bg cell-invalid",
        ]);
    });

    it("lays a hatch over cells that are not normal, and only those", () => {
        const { container } = renderBoard(scene2({ r1c2: { tone: "violated" } }));
        const hatches = container.querySelectorAll('rect[fill^="url(#hatch-"]');
        expect(hatches).toHaveLength(1);
        expect(hatches[0].getAttribute("x")).toBe("40");
        // the fill points at a pattern that exists
        const id = hatches[0].getAttribute("fill")!.slice(5, -1);
        expect(container.querySelector(`pattern[id="${id}"]`)).not.toBeNull();
    });

    it("covers only the hidden cells with fog", () => {
        const { container } = renderBoard(scene2({ r2c1: { hidden: true } }));
        const fog = container.querySelectorAll(".fog .cell-fog");
        expect(fog).toHaveLength(1);
        expect(fog[0].getAttribute("y")).toBe("40");
    });

    it("washes cells that share the selected value", () => {
        const { container } = renderBoard(scene2({ r1c1: { sameValue: true }, r2c2: { sameValue: true } }));
        expect(container.querySelectorAll(".cell-same")).toHaveLength(2);
    });

    it("draws a ring on the cursor cell only, inset from its edges", () => {
        const { container } = renderBoard(scene2({ r1c2: { ring: "cursor" }, r2c1: { ring: "selected" } }));
        const rings = container.querySelectorAll(".cell-ring");
        expect(rings).toHaveLength(1);
        expect(rings[0].getAttribute("x")).toBe(String(40 + 40 * 0.05));
        expect(rings[0].getAttribute("width")).toBe(String(40 - 40 * 0.1));
    });

    it("draws the outline of the selection", () => {
        const scene = scene2();
        scene.selectionOutline = [
            [
                { x: 0, y: 0 },
                { x: 40, y: 0 },
            ],
        ];
        const { container } = renderBoard(scene);
        const line = container.querySelector(".selection-outline")!;
        expect(line.getAttribute("x2")).toBe("40");
    });

    it("splits a cell into even stripes, one for each colour mark", () => {
        const marks = [
            { position: 1, color: "red" },
            { position: 2, color: "blue" },
        ];
        const { container } = renderBoard(scene2({ r1c1: { marks } }));
        const stripes = [...container.querySelectorAll(".cell-mark")];
        expect(stripes.map((s) => s.getAttribute("fill"))).toEqual(["red", "blue"]);
        expect(stripes.map((s) => s.getAttribute("width"))).toEqual(["20", "20"]);
        expect(stripes.map((s) => s.getAttribute("x"))).toEqual(["0", "20"]);
    });

    it("draws grid lines heavier for box edges", () => {
        const scene = scene2();
        scene.gridLines = [
            {
                points: [
                    { x: 40, y: 0 },
                    { x: 40, y: 80 },
                ],
                weight: 3,
            },
            {
                points: [
                    { x: 0, y: 40 },
                    { x: 80, y: 40 },
                ],
                weight: 1,
            },
        ] as Scene["gridLines"];
        const { container } = renderBoard(scene);
        const lines = [...container.querySelectorAll(".grid line")];
        expect(lines.map((l) => l.getAttribute("stroke"))).toEqual(["var(--line-strong)", "var(--line)"]);
    });
});

describe("Board — digits and notes", () => {
    it("shows a given and an entered digit with different classes", () => {
        const { container } = renderBoard(
            scene2({ r1c1: { value: 3, given: true }, r1c2: { value: 4, given: false } }),
        );
        const digits = [...container.querySelectorAll(".digit")];
        expect(
            digits.map((d) => [d.textContent, d.classList.contains("given"), d.classList.contains("entered")]),
        ).toEqual([
            ["3", true, false],
            ["4", false, true],
        ]);
    });

    it("shows corner notes in the corners and none when the cell has a value", () => {
        const { container } = renderBoard(scene2({ r1c1: { notes: [1, 2, 3, 4] }, r2c2: { value: 2, notes: [1] } }));
        const notes = [...container.querySelectorAll(".note")];
        expect(notes.map((n) => n.textContent)).toEqual(["1", "2", "3", "4"]);
        // four distinct corner positions
        expect(new Set(notes.map((n) => `${n.getAttribute("x")},${n.getAttribute("y")}`)).size).toBe(4);
        // all inside the first cell
        for (const n of notes) {
            expect(Number(n.getAttribute("x"))).toBeLessThan(40);
            expect(Number(n.getAttribute("y"))).toBeLessThan(40);
        }
    });

    it("marks flagged notes, either for the whole cell or one candidate", () => {
        const { container } = renderBoard(
            scene2({
                r1c1: { notes: [1, 2], ruledOutNotes: [2] },
                r1c2: { notes: [3], flagged: true },
            }),
        );
        const flagged = [...container.querySelectorAll(".note")].map((n) => n.classList.contains("note-flagged"));
        expect(flagged).toEqual([false, true, true]);
    });

    it("joins centre notes into one text run, shrinking as the run grows", () => {
        const { container } = renderBoard(
            scene2({ r1c1: { centerNotes: [1, 2] }, r1c2: { centerNotes: [1, 2, 3, 4, 5, 6, 7, 8, 9] } }),
        );
        const runs = [...container.querySelectorAll(".note-center")];
        expect(runs.map((r) => r.textContent)).toEqual(["12", "123456789"]);
        const [short, long] = runs.map((r) => Number(r.getAttribute("font-size")));
        expect(short).toBeGreaterThan(long);
        // never taller than 30% of the cell, never smaller than 11%
        expect(short).toBeLessThanOrEqual(40 * 0.3 + 1e-9);
        expect(long).toBeGreaterThanOrEqual(40 * 0.11 - 1e-9);
    });

    it("flags a ruled-out centre note on its own span", () => {
        const { container } = renderBoard(scene2({ r1c1: { centerNotes: [1, 2], ruledOutNotes: [2] } }));
        const spans = [...container.querySelectorAll(".note-center tspan")];
        expect(spans.map((s) => s.classList.contains("note-flagged"))).toEqual([false, true]);
    });

    it("draws no digit layer content for an empty cell", () => {
        const { container } = renderBoard(scene2());
        expect(container.querySelectorAll(".digit, .note, .note-center")).toHaveLength(0);
    });
});

describe("Board — pointer callbacks", () => {
    it("starts a paint on the pressed cell, additive only with a modifier key", () => {
        const onPaintStart = vi.fn();
        const { container } = renderBoard(scene2(), { onPaintStart });
        const bgs = container.querySelectorAll(".cell-bg");
        fireEvent.pointerDown(bgs[1]);
        fireEvent.pointerDown(bgs[2], { shiftKey: true });
        fireEvent.pointerDown(bgs[3], { ctrlKey: true });
        fireEvent.pointerDown(bgs[0], { metaKey: true });
        expect(onPaintStart.mock.calls).toEqual([
            ["r1c2", false],
            ["r2c1", true],
            ["r2c2", true],
            ["r1c1", true],
        ]);
    });

    it("does not start a paint on a middle or right button (they pan)", () => {
        const onPaintStart = vi.fn();
        const { container } = renderBoard(scene2(), { onPaintStart });
        const bg = container.querySelector(".cell-bg")!;
        fireEvent.pointerDown(bg, { button: 1 });
        fireEvent.pointerDown(bg, { button: 2 });
        expect(onPaintStart).not.toHaveBeenCalled();
    });

    it("focuses the board on a cell press, so Tab and keys act on it", () => {
        const { container } = renderBoard(scene2());
        fireEvent.pointerDown(container.querySelector(".cell-bg")!);
        expect(document.activeElement).toBe(container.querySelector("svg.board"));
    });

    it("paints cells entered during a drag and ends on release", () => {
        const onPaintMove = vi.fn();
        const onPaintEnd = vi.fn();
        const { container } = renderBoard(scene2(), { onPaintMove, onPaintEnd });
        const bgs = container.querySelectorAll(".cell-bg");
        fireEvent.pointerDown(bgs[0]);
        fireEvent.pointerEnter(bgs[1]);
        expect(onPaintMove).toHaveBeenCalledWith("r1c2");
        fireEvent.pointerUp(container.querySelector("svg.board")!);
        expect(onPaintEnd).toHaveBeenCalledTimes(1);
        // a second release without a drag does not end again
        fireEvent.pointerUp(container.querySelector("svg.board")!);
        expect(onPaintEnd).toHaveBeenCalledTimes(1);
    });

    it("ends a drag when the pointer leaves the board", () => {
        const onPaintEnd = vi.fn();
        const { container } = renderBoard(scene2(), { onPaintEnd });
        fireEvent.pointerDown(container.querySelector(".cell-bg")!);
        fireEvent.pointerLeave(container.querySelector("svg.board")!);
        expect(onPaintEnd).toHaveBeenCalledTimes(1);
    });

    it("ignores pointer entering a cell when no drag is active", () => {
        const onPaintMove = vi.fn();
        const { container } = renderBoard(scene2(), { onPaintMove });
        fireEvent.pointerEnter(container.querySelectorAll(".cell-bg")[1]);
        expect(onPaintMove).not.toHaveBeenCalled();
    });

    it("reports a double-click on the cell", () => {
        const onCellDoubleClick = vi.fn();
        const { container } = renderBoard(scene2(), { onCellDoubleClick });
        fireEvent.doubleClick(container.querySelectorAll(".cell-bg")[3]);
        expect(onCellDoubleClick).toHaveBeenCalledWith("r2c2");
    });

    it("clears the selection when the paper behind the cells is pressed", () => {
        const onClearSelection = vi.fn();
        const { container } = renderBoard(scene2(), { onClearSelection });
        fireEvent.pointerDown(container.querySelector('svg.board > rect[fill="var(--surface)"]')!);
        expect(onClearSelection).toHaveBeenCalledTimes(1);
    });

    it("suppresses the browser context menu so a right-drag can pan", () => {
        const { container } = renderBoard(scene2());
        const notPrevented = fireEvent.contextMenu(container.querySelector(".board-viewport")!);
        expect(notPrevented).toBe(false);
    });
});

describe("Board — accessibility and slots", () => {
    it("names the board and points at its instructions", () => {
        const { container } = renderBoard(scene2(), { label: "Sudoku board", describedBy: "help-1" });
        const svg = container.querySelector("svg.board")!;
        expect(svg.getAttribute("aria-label")).toBe("Sudoku board");
        expect(svg.getAttribute("aria-describedby")).toBe("help-1");
        expect(svg.getAttribute("tabindex")).toBe("0");
        expect(svg.getAttribute("role")).toBe("group");
    });

    it("renders the header above and the footer next to the zoom button", () => {
        const { container } = renderBoard(scene2(), { header: <b>Head</b>, footer: <i>Foot</i> });
        expect(container.querySelector(".board-header")!.textContent).toBe("Head");
        expect(container.querySelector(".board-footer-content")!.textContent).toBe("Foot");
    });

    it("has no header row without a header, and no footer row when hidden", () => {
        const { container } = renderBoard(scene2(), { hideFooter: true });
        expect(container.querySelector(".board-header")).toBeNull();
        expect(container.querySelector(".board-footer")).toBeNull();
    });
});

describe("Board — pen layer", () => {
    const penScene = (): Scene => {
        const scene = scene2();
        const style = { stroke: "red", fill: "none", strokeWidth: 2, dashed: false, opacity: 1, z: 0 };
        scene.pen = [
            {
                kind: "polyline",
                points: [
                    { x: 0, y: 0 },
                    { x: 40, y: 0 },
                ],
                style,
                rounded: true,
            },
            { kind: "circle", cx: 20, cy: 20, r: 8, style },
        ];
        return scene;
    };

    it("draws the lines and marks the player already made", () => {
        const { container } = renderBoard(penScene());
        const layer = container.querySelector("g.pen")!;
        expect(layer.querySelectorAll("polyline, line, path")).toHaveLength(1);
        expect(layer.querySelectorAll("circle")).toHaveLength(1);
    });

    it("lets pointer events through the drawn pen shapes to the surface below", () => {
        const { container } = renderBoard(penScene());
        expect(container.querySelector("g.pen")!.getAttribute("pointer-events")).toBe("none");
    });
});
