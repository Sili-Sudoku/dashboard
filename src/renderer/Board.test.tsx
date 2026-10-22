// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

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

describe("Board — large puzzles (above the virtualization threshold)", () => {
    // jsdom reports 0 for clientWidth/clientHeight by default (no real layout);
    // stub them so the viewport-measuring effect has something realistic to work with.
    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 100 });
        Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 100 });
    });
    afterAll(() => {
        Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
        Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
    });

    it("wraps the board in a scrollable viewport and culls offscreen cells", () => {
        const scene = bigScene(25); // 625 cells, well above the 400 threshold
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );

        const viewport = container.querySelector(".board-viewport");
        expect(viewport).not.toBeNull();

        const rendered = container.querySelectorAll(".cell-bg").length;
        expect(rendered).toBeGreaterThan(0);
        expect(rendered).toBeLessThan(625); // culled — not every cell made it into the DOM
    });

    it("renders cells near the scrolled-to position, not cells far away from it", () => {
        const scene = bigScene(25, 20); // 500x500px board
        const { container } = render(
            <Board scene={scene} onPaintStart={noop} onPaintMove={noop} onPaintEnd={noop} onClearSelection={noop} />,
        );

        const viewport = container.querySelector(".board-viewport") as HTMLDivElement;
        act(() => {
            viewport.scrollLeft = 200;
            viewport.scrollTop = 200;
            viewport.dispatchEvent(new Event("scroll"));
        });

        // r11c11 sits at (200, 200) — right at the scrolled-to viewport's corner.
        expect(container.querySelector('.cell-bg[x="200"][y="200"]')).not.toBeNull();
        // r1c1 (0,0) and the far corner (480,480) are well outside the 100x100
        // viewport + a 2-cell margin once scrolled to (200, 200).
        expect(container.querySelector('.cell-bg[x="0"][y="0"]')).toBeNull();
        expect(container.querySelector('.cell-bg[x="480"][y="480"]')).toBeNull();
    });
});
