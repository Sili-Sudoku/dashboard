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

const compiledWithZeroInDomain = () => {
    const result = compilePuzzle(
        {
            version: 1,
            metadata: { id: "zero-domain", title: "zero-domain" },
            geometry: { type: "grid", width: 2, height: 2 },
            domain: { values: [0, 1, 2, 3] },
            constraints: [],
        },
        definitions,
    );
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

    it("hides the constraint panel by default, revealed via a toggle", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        expect(container.querySelector(".constraint-panel")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: /show constraints/i }));
        expect(container.querySelector(".constraint-panel")).not.toBeNull();

        fireEvent.click(screen.getByRole("button", { name: /hide constraints/i }));
        expect(container.querySelector(".constraint-panel")).toBeNull();
    });

    it("reflects a broken constraint in the panel", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        // put a '1' next to a given '1' in row 1 -> row:0 allDifferent breaks
        fireEvent.pointerDown(cells[1]);
        fireEvent.click(screen.getByRole("button", { name: "1" }));

        fireEvent.click(screen.getByRole("button", { name: /show constraints/i }));
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

    it("toggles corner and centre notes via Shift/Ctrl+digit, independent of note mode", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        fireEvent.pointerDown(cells[1]); // empty cell, not in note mode

        fireEvent.keyDown(window, { code: "Digit2", shiftKey: true });
        fireEvent.keyDown(window, { code: "Digit4", shiftKey: true });
        expect(container.querySelectorAll(".note")).toHaveLength(2);

        fireEvent.keyDown(window, { code: "Digit3", ctrlKey: true });
        const center = container.querySelector(".note-center");
        expect(center?.textContent).toBe("3");

        // toggling again removes it
        fireEvent.keyDown(window, { code: "Digit3", ctrlKey: true });
        expect(container.querySelector(".note-center")).toBeNull();
    });

    it("previews the Corner/Center pad mode while Shift/Ctrl is held, and restores it on release", () => {
        render(<PuzzlePlayer puzzle={compiled()} />);
        const digitMode = screen.getByRole("button", { name: /^Digit$/ });
        const cornerMode = screen.getByRole("button", { name: /^Corner$/ });
        const centerMode = screen.getByRole("button", { name: /^Center$/ });
        expect(digitMode.getAttribute("aria-pressed")).toBe("true");

        fireEvent.keyDown(window, { key: "Shift" });
        expect(cornerMode.getAttribute("aria-pressed")).toBe("true");

        fireEvent.keyUp(window, { key: "Shift" });
        expect(digitMode.getAttribute("aria-pressed")).toBe("true");

        fireEvent.keyDown(window, { key: "Control" });
        expect(centerMode.getAttribute("aria-pressed")).toBe("true");

        fireEvent.keyUp(window, { key: "Control" });
        expect(digitMode.getAttribute("aria-pressed")).toBe("true");
    });

    it("restores the pad's own mode (not always digit) after a held-modifier preview", () => {
        render(<PuzzlePlayer puzzle={compiled()} />);
        fireEvent.click(screen.getByRole("button", { name: /^Corner$/ }));

        fireEvent.keyDown(window, { key: "Control" });
        expect(screen.getByRole("button", { name: /^Center$/ }).getAttribute("aria-pressed")).toBe("true");

        fireEvent.keyUp(window, { key: "Control" });
        expect(screen.getByRole("button", { name: /^Corner$/ }).getAttribute("aria-pressed")).toBe("true");
    });

    it("switches the number pad's input mode via its mode buttons and reflects clicks accordingly", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        fireEvent.pointerDown(cells[1]); // empty cell

        const digitMode = screen.getByRole("button", { name: /^Digit$/ });
        const cornerMode = screen.getByRole("button", { name: /^Corner$/ });
        const centerMode = screen.getByRole("button", { name: /^Center$/ });
        expect(digitMode.getAttribute("aria-pressed")).toBe("true");

        fireEvent.click(cornerMode);
        expect(cornerMode.getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(screen.getByRole("button", { name: "2" }));
        expect(container.querySelectorAll(".digit.entered")).toHaveLength(0);
        expect(container.querySelectorAll(".note")).toHaveLength(1);

        fireEvent.click(centerMode);
        fireEvent.click(screen.getByRole("button", { name: "3" }));
        expect(container.querySelector(".note-center")?.textContent).toBe("3");

        fireEvent.click(digitMode);
        fireEvent.click(screen.getByRole("button", { name: "4" }));
        expect(container.querySelectorAll(".digit.entered")).toHaveLength(1);
        expect(container.querySelector(".note-center")).toBeNull();
        expect(container.querySelectorAll(".note")).toHaveLength(0);
    });

    it("Erase clears only the layer matching the active pad mode", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        fireEvent.pointerDown(cells[1]); // empty cell

        fireEvent.click(screen.getByRole("button", { name: /^Corner$/ }));
        fireEvent.click(screen.getByRole("button", { name: "1" }));
        fireEvent.click(screen.getByRole("button", { name: /^Center$/ }));
        fireEvent.click(screen.getByRole("button", { name: "2" }));

        const erase = screen.getByRole("button", { name: /erase/i });

        // digit mode: nothing to erase, both notes survive
        fireEvent.click(screen.getByRole("button", { name: /^Digit$/ }));
        fireEvent.click(erase);
        expect(container.querySelectorAll(".note")).toHaveLength(1);
        expect(container.querySelector(".note-center")?.textContent).toBe("2");

        // center mode: only the centre note goes
        fireEvent.click(screen.getByRole("button", { name: /^Center$/ }));
        fireEvent.click(erase);
        expect(container.querySelectorAll(".note")).toHaveLength(1);
        expect(container.querySelector(".note-center")).toBeNull();

        // corner mode: the surviving corner note goes too
        fireEvent.click(screen.getByRole("button", { name: /^Corner$/ }));
        fireEvent.click(erase);
        expect(container.querySelectorAll(".note")).toHaveLength(0);
    });

    it("prevents the browser back-navigation gesture on Backspace/Delete", () => {
        render(<PuzzlePlayer puzzle={compiled()} />);
        for (const key of ["Backspace", "Delete"]) {
            const event = new KeyboardEvent("keydown", { key, cancelable: true });
            window.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(true);
        }
    });

    it("hides the 'check notes on leave' toggle for puzzles with no declared solution", () => {
        render(<PuzzlePlayer puzzle={compiledWithZeroInDomain()} />);
        expect(screen.queryByRole("button", { name: /check notes on leave/i })).toBeNull();
    });

    it("'0' is a plain digit for domains that include it, separate from erase", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiledWithZeroInDomain()} />);
        fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[0]);

        fireEvent.keyDown(window, { key: "0" });
        const entered = container.querySelectorAll(".digit.entered");
        expect(entered).toHaveLength(1);
        expect(entered[0].textContent).toBe("0");

        fireEvent.keyDown(window, { key: "Backspace" });
        expect(container.querySelectorAll(".digit.entered")).toHaveLength(0);
    });

    it("Ctrl+Y redoes, same as Ctrl+Shift+Z", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[1]);
        fireEvent.click(screen.getByRole("button", { name: "3" }));
        expect(container.querySelectorAll(".digit.entered")).toHaveLength(1);

        fireEvent.keyDown(window, { key: "z", ctrlKey: true });
        expect(container.querySelectorAll(".digit.entered")).toHaveLength(0);

        fireEvent.keyDown(window, { key: "y", ctrlKey: true });
        expect(container.querySelectorAll(".digit.entered")).toHaveLength(1);
    });

    it("Enter selects every cell sharing the cursor cell's value", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        fireEvent.pointerDown(cells[1]); // r1c2
        fireEvent.click(screen.getByRole("button", { name: "3" }));
        fireEvent.pointerDown(cells[4]); // r2c1
        fireEvent.click(screen.getByRole("button", { name: "3" }));

        fireEvent.pointerDown(cells[1]); // cursor back on r1c2
        fireEvent.keyDown(window, { key: "Enter" });

        expect(container.querySelectorAll(".cell-ring-cursor, .cell-ring-selected")).toHaveLength(2);
    });

    it("Tab/Shift+Tab jump the cursor between empty cells, but not while a control is focused", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const cursorRing = () => container.querySelector(".cell-ring-cursor") as SVGRectElement;
        const ringPos = () => ({ x: cursorRing().getAttribute("x"), y: cursorRing().getAttribute("y") });

        fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[0]); // r1c1 (given)
        const start = ringPos();

        fireEvent.keyDown(window, { key: "Tab" });
        const afterTab = ringPos();
        expect(afterTab).not.toEqual(start);

        fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
        expect(ringPos()).not.toEqual(afterTab);

        // Tab's normal job (moving focus between controls) takes over once a
        // control actually has focus, instead of jumping the puzzle cursor.
        const eraseButton = screen.getByRole("button", { name: /erase/i });
        eraseButton.focus();
        const beforeFocusedTab = ringPos();
        fireEvent.keyDown(window, { key: "Tab" });
        expect(ringPos()).toEqual(beforeFocusedTab);
    });

    it("Escape visibly removes the cursor ring, not just an invisible internal selection", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[1]);
        expect(container.querySelector(".cell-ring-cursor")).not.toBeNull();

        fireEvent.keyDown(window, { key: "Escape" });
        expect(container.querySelector(".cell-ring-cursor")).toBeNull();
        expect(container.querySelector(".cell-ring-selected")).toBeNull();

        // arrow keys still work afterwards, re-anchoring instead of staying dead
        fireEvent.keyDown(window, { key: "ArrowRight" });
        expect(container.querySelector(".cell-ring-cursor")).not.toBeNull();
    });

    it("flags a cell's remaining notes in red on leave, once 'check notes on leave' is enabled", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");

        // off by default: a bad elimination on r1c2 (solution digit is '2') goes unflagged
        fireEvent.pointerDown(cells[1]);
        fireEvent.click(screen.getByRole("button", { name: /^Corner$/ }));
        fireEvent.click(screen.getByRole("button", { name: "1" }));
        fireEvent.click(screen.getByRole("button", { name: "3" }));
        fireEvent.pointerDown(cells[2]); // leave r1c2
        expect(container.querySelectorAll(".note-flagged")).toHaveLength(0);

        const checkToggle = screen.getByRole("button", { name: /check notes on leave/i });
        fireEvent.click(checkToggle);
        expect(checkToggle.getAttribute("aria-pressed")).toBe("true");

        fireEvent.pointerDown(cells[1]); // back on r1c2, candidates {1,3} still missing '2'
        fireEvent.pointerDown(cells[2]); // leave again — now checked
        expect(container.querySelectorAll(".note-flagged")).toHaveLength(2);

        // fixing the candidates (adding the correct digit back) clears the flag on next leave
        fireEvent.pointerDown(cells[1]);
        fireEvent.click(screen.getByRole("button", { name: "2" }));
        fireEvent.pointerDown(cells[2]);
        expect(container.querySelectorAll(".note-flagged")).toHaveLength(0);
    });

    it("hides the keyboard shortcut legend by default, revealed via a toggle", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        expect(container.querySelector(".hotkey-legend")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: /keyboard shortcuts/i }));
        expect(container.querySelector(".hotkey-legend")).not.toBeNull();

        fireEvent.click(screen.getByRole("button", { name: /hide shortcuts/i }));
        expect(container.querySelector(".hotkey-legend")).toBeNull();
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
