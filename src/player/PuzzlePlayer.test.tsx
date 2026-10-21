// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { compilePuzzle } from "@/runtime/compile.ts";
import { definitions } from "@/definitions/index.ts";
import { miniSudoku } from "@/puzzles/mini_sudoku.ts";
import PuzzlePlayer from "@/player/PuzzlePlayer.tsx";

const compiled = () => {
    const result = compilePuzzle(miniSudoku, definitions);
    if (result instanceof Error) throw result;
    return result;
};

afterEach(() => {
    cleanup();
    localStorage.clear();
});

describe("<PuzzlePlayer />", () => {
    it("renders one interactive cell per geometry cell", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        expect(container.querySelectorAll(".cell-bg")).toHaveLength(16);
    });

    it("shows the givens", () => {
        render(<PuzzlePlayer puzzle={compiled()} />);
        // mini sudoku has four '1' givens
        expect(screen.getAllByText("1").filter((n) => n.classList.contains("given"))).toHaveLength(4);
    });

    it("enters a digit into a selected empty cell via the number pad", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        // r1c2 is empty in mini sudoku (index 1)
        fireEvent.pointerDown(cells[1]);

        const pad = screen.getByRole("button", { name: "3" });
        fireEvent.click(pad);

        const entered = container.querySelectorAll(".digit.entered");
        expect(entered).toHaveLength(1);
        expect(entered[0].textContent).toBe("3");
    });

    it("reflects a broken constraint in the panel", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        // put a '1' next to a given '1' in row 1 -> row:0 allDifferent breaks
        fireEvent.pointerDown(cells[1]);
        fireEvent.click(screen.getByRole("button", { name: "1" }));

        const panel = container.querySelector(".constraint-panel") as HTMLElement;
        expect(within(panel).getByText("Some constraints are broken")).toBeTruthy();
        // row:0, the top-left box, and col:1 each break on a duplicate '1' — but only
        // the specific duplicate cells (r1c1+r1c2, and r1c2+r3c2) should be flagged,
        // not every cell those three groups span (which would be 8+ cells).
        expect(container.querySelectorAll(".cell-violated").length).toBe(3);
        // the clicked cell is both violated and the cursor — the cursor ring must
        // still render, so a click on a broken cell still visibly registers.
        expect(container.querySelectorAll(".cell-ring-cursor")).toHaveLength(1);
    });

    it("prevents the browser back-navigation gesture on Backspace/Delete", () => {
        render(<PuzzlePlayer puzzle={compiled()} />);
        for (const key of ["Backspace", "Delete"]) {
            const event = new KeyboardEvent("keydown", { key, cancelable: true });
            window.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(true);
        }
    });

    it("solving the puzzle surfaces the completion banner", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const solution = miniSudoku.solution as Record<string, number>;
        const cellEls = container.querySelectorAll<SVGRectElement>(".cell-bg");

        cellEls.forEach((el, i) => {
            const cell = `r${Math.floor(i / 4) + 1}c${(i % 4) + 1}`;
            if (cell in (miniSudoku.givens ?? {})) return;
            fireEvent.pointerDown(el);
            fireEvent.click(screen.getByRole("button", { name: String(solution[cell]) }));
        });

        expect(screen.getByText("Solved!")).toBeTruthy();
    });
});
