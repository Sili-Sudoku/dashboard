// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { compilePuzzle } from "@/runtime/compile.ts";
import { definitions } from "@/definitions/index.ts";
import { miniSudoku } from "@/puzzles/mini_sudoku.ts";
import { statsStorageKey, type PuzzleStats } from "@/runtime/session.ts";
import PuzzlePlayer from "@/player/PuzzlePlayer.tsx";
import { ToastViewport } from "@/app/toast_viewport.tsx";
import { clearToasts } from "@/app/toast.ts";

/** Key events must originate inside the player (#155), so tests dispatch from its root. */
const root = () => document.querySelector(".puzzle-player")!;

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

/** A tiny geometry with a 1-25 domain — enough to exercise multi-digit keyboard
 * entry without pulling in the 625-cell large-demo puzzle and its virtualization. */
const compiledWithLargeDomain = () => {
    const result = compilePuzzle(
        {
            version: 1,
            metadata: { id: "large-domain", title: "large-domain" },
            geometry: { type: "grid", width: 2, height: 2 },
            domain: { values: Array.from({ length: 25 }, (_, i) => i + 1) },
            constraints: [],
        },
        definitions,
    );
    if (result instanceof Error) throw result;
    return result;
};

afterEach(() => {
    cleanup();
    clearToasts();
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

    it("showSolution fills in the declared solution as a display-only overlay, reversible with no effect on the real board", () => {
        const puzzle = compiled();
        const { container, rerender } = render(<PuzzlePlayer puzzle={puzzle} />);
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        fireEvent.pointerDown(cells[1]); // r1c2, empty in mini sudoku
        fireEvent.click(screen.getByRole("button", { name: "3" }));
        expect(container.querySelectorAll(".digit")).toHaveLength(5); // 4 givens + the one just entered

        rerender(<PuzzlePlayer puzzle={puzzle} showSolution />);
        // Every cell now shows a digit (solution is a full board); the real
        // entry made above is masked, not overwritten -- confirmed below.
        expect(container.querySelectorAll(".digit")).toHaveLength(16);
        expect(container.querySelectorAll(".digit.given")).toHaveLength(4);

        rerender(<PuzzlePlayer puzzle={puzzle} showSolution={false} />);
        const entered = container.querySelectorAll(".digit.entered");
        expect(entered).toHaveLength(1);
        expect(entered[0].textContent).toBe("3");
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
        expect(container.querySelector(".cp-groups")).toBeNull();

        // The toggle button doubles as the status line once open, so its
        // accessible name changes (e.g. to "In progress — n/m cells") —
        // hold the node rather than re-querying by the "show/hide" label.
        const toggle = screen.getByRole("button", { name: /show constraints/i });
        fireEvent.click(toggle);
        expect(container.querySelector(".cp-groups")).not.toBeNull();
        expect(toggle.getAttribute("aria-expanded")).toBe("true");

        fireEvent.click(toggle);
        expect(container.querySelector(".cp-groups")).toBeNull();
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
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

        fireEvent.keyDown(root(), { code: "Digit2", shiftKey: true });
        fireEvent.keyDown(root(), { code: "Digit4", shiftKey: true });
        expect(container.querySelectorAll(".note")).toHaveLength(2);

        fireEvent.keyDown(root(), { code: "Digit3", ctrlKey: true });
        const center = container.querySelector(".note-center");
        expect(center?.textContent).toBe("3");

        // toggling again removes it
        fireEvent.keyDown(root(), { code: "Digit3", ctrlKey: true });
        expect(container.querySelector(".note-center")).toBeNull();
    });

    it("previews the Corner/Center pad mode while Shift/Ctrl is held, and restores it on release", () => {
        render(<PuzzlePlayer puzzle={compiled()} />);
        const digitMode = screen.getByRole("button", { name: /^Digit$/ });
        const cornerMode = screen.getByRole("button", { name: /^Corner$/ });
        const centerMode = screen.getByRole("button", { name: /^Center$/ });
        expect(digitMode.getAttribute("aria-pressed")).toBe("true");

        fireEvent.keyDown(root(), { key: "Shift" });
        expect(cornerMode.getAttribute("aria-pressed")).toBe("true");

        fireEvent.keyUp(root(), { key: "Shift" });
        expect(digitMode.getAttribute("aria-pressed")).toBe("true");

        fireEvent.keyDown(root(), { key: "Control" });
        expect(centerMode.getAttribute("aria-pressed")).toBe("true");

        fireEvent.keyUp(root(), { key: "Control" });
        expect(digitMode.getAttribute("aria-pressed")).toBe("true");
    });

    it("restores the pad's own mode (not always digit) after a held-modifier preview", () => {
        render(<PuzzlePlayer puzzle={compiled()} />);
        fireEvent.click(screen.getByRole("button", { name: /^Corner$/ }));

        fireEvent.keyDown(root(), { key: "Control" });
        expect(screen.getByRole("button", { name: /^Center$/ }).getAttribute("aria-pressed")).toBe("true");

        fireEvent.keyUp(root(), { key: "Control" });
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
        fireEvent.click(screen.getByRole("button", { name: "Corner note 2" }));
        expect(container.querySelectorAll(".digit.entered")).toHaveLength(0);
        expect(container.querySelectorAll(".note")).toHaveLength(1);

        fireEvent.click(centerMode);
        fireEvent.click(screen.getByRole("button", { name: "Center note 3" }));
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
        fireEvent.click(screen.getByRole("button", { name: "Corner note 1" }));
        fireEvent.click(screen.getByRole("button", { name: /^Center$/ }));
        fireEvent.click(screen.getByRole("button", { name: "Center note 2" }));

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
            const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
            root().dispatchEvent(event);
            expect(event.defaultPrevented).toBe(true);
        }
    });

    it("R reads the cursor's row aloud in a live region, and repeats on a second press (#155)", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const live = () => container.querySelector('[aria-live="assertive"]')!.textContent;
        fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[1]); // r1c2
        fireEvent.keyDown(root(), { key: "r" });
        const first = live();
        expect(first).toMatch(/^Row 1: /);
        fireEvent.keyDown(root(), { key: "r" });
        expect(live()).not.toBe(first); // changed (zero-width suffix) so it re-announces
        fireEvent.keyDown(root(), { key: "g" });
        expect(live()).toMatch(/givens?: /);
    });

    it("ignores shortcuts from outside the player, e.g. a dialog or the page header (#155)", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[1]);
        const outside = document.createElement("button");
        document.body.append(outside);
        const event = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true });
        outside.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        outside.remove();
    });

    it("'0' is a plain digit for domains that include it, separate from erase", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiledWithZeroInDomain()} />);
        fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[0]);

        fireEvent.keyDown(root(), { key: "0" });
        const entered = container.querySelectorAll(".digit.entered");
        expect(entered).toHaveLength(1);
        expect(entered[0].textContent).toBe("0");

        fireEvent.keyDown(root(), { key: "Backspace" });
        expect(container.querySelectorAll(".digit.entered")).toHaveLength(0);
    });

    it("Ctrl+Y redoes, same as Ctrl+Shift+Z", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[1]);
        fireEvent.click(screen.getByRole("button", { name: "3" }));
        expect(container.querySelectorAll(".digit.entered")).toHaveLength(1);

        fireEvent.keyDown(root(), { key: "z", ctrlKey: true });
        expect(container.querySelectorAll(".digit.entered")).toHaveLength(0);

        fireEvent.keyDown(root(), { key: "y", ctrlKey: true });
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
        fireEvent.keyDown(root(), { key: "Enter" });

        // the cursor keeps its own ring; the other selected cell is covered by the combined outline (#157)
        expect(container.querySelectorAll(".cell-ring-cursor")).toHaveLength(1);
        expect(container.querySelectorAll(".selection-outline")).toHaveLength(8); // two diagonal cells: 4 edges each
    });

    it("Tab/Shift+Tab step between empty cells while the board has focus, and fall through at the ends", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const cursorRing = () => container.querySelector(".cell-ring-cursor") as SVGRectElement;
        const ringPos = () => ({ x: cursorRing().getAttribute("x"), y: cursorRing().getAttribute("y") });
        const board = container.querySelector<SVGSVGElement>("svg.board")!;
        expect(board.getAttribute("tabindex")).toBe("0");

        fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[0]); // r1c1 (given)
        board.focus();
        const start = ringPos();

        expect(fireEvent.keyDown(board, { key: "Tab" })).toBe(false); // handled -> default prevented
        const afterTab = ringPos();
        expect(afterTab).not.toEqual(start);

        // r1c2 is the first empty cell: Shift+Tab has nowhere earlier to go, so it falls through.
        expect(fireEvent.keyDown(board, { key: "Tab", shiftKey: true })).toBe(true);
        expect(ringPos()).toEqual(afterTab);
        fireEvent.keyDown(board, { key: "Tab" });
        expect(ringPos()).not.toEqual(afterTab);
        fireEvent.keyDown(board, { key: "Tab", shiftKey: true });
        expect(ringPos()).toEqual(afterTab);

        // Past the last empty cell Tab is left alone so focus can leave the board.
        for (let i = 0; i < 40; i++) fireEvent.keyDown(board, { key: "Tab" });
        const atEnd = ringPos();
        expect(fireEvent.keyDown(board, { key: "Tab" })).toBe(true);
        expect(ringPos()).toEqual(atEnd);
    });

    it("doesn't steal Tab or Enter from a focused control", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[1]);
        const eraseButton = screen.getByRole("button", { name: /erase/i });
        eraseButton.focus();
        expect(fireEvent.keyDown(eraseButton, { key: "Tab" })).toBe(true);
        expect(fireEvent.keyDown(eraseButton, { key: "Enter" })).toBe(true);
        expect(fireEvent.keyDown(eraseButton, { key: " " })).toBe(true);
    });

    it("Escape visibly removes the cursor ring, not just an invisible internal selection", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[1]);
        expect(container.querySelector(".cell-ring-cursor")).not.toBeNull();

        fireEvent.keyDown(root(), { key: "Escape" });
        expect(container.querySelector(".cell-ring-cursor")).toBeNull();
        expect(container.querySelector(".selection-outline")).toBeNull();

        // arrow keys still work afterwards, re-anchoring instead of staying dead
        fireEvent.keyDown(root(), { key: "ArrowRight" });
        expect(container.querySelector(".cell-ring-cursor")).not.toBeNull();
    });

    it("leaves centre notes unflagged by default ('check notes on leave' is a Settings (#69) preference, off by default)", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");

        // a bad elimination on r1c2 (solution digit is '2') goes unflagged
        fireEvent.pointerDown(cells[1]);
        fireEvent.click(screen.getByRole("button", { name: /^Center$/ }));
        fireEvent.click(screen.getByRole("button", { name: "Center note 1" }));
        fireEvent.click(screen.getByRole("button", { name: "Center note 3" }));
        fireEvent.pointerDown(cells[2]); // leave r1c2
        expect(container.querySelectorAll(".note-flagged")).toHaveLength(0);
    });

    it("flags a cell's remaining centre notes in red on leave, once the Settings (#69) preference is on", () => {
        // No in-page toggle anymore — this is a Settings-page preference, read
        // once when the puzzle session is constructed.
        localStorage.setItem("cpr:settings", JSON.stringify({ checkNotesOnLeave: true }));
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");

        fireEvent.pointerDown(cells[1]); // r1c2, solution digit is '2'
        fireEvent.click(screen.getByRole("button", { name: /^Center$/ }));
        fireEvent.click(screen.getByRole("button", { name: "Center note 1" }));
        fireEvent.click(screen.getByRole("button", { name: "Center note 3" }));
        fireEvent.pointerDown(cells[2]); // leave r1c2 — candidates {1,3} still missing '2'
        // Centre notes render as one joined <text>, unlike one-per-digit corner notes.
        expect(container.querySelectorAll(".note-flagged")).toHaveLength(1);

        // fixing the candidates (adding the correct digit back) clears the flag on next leave
        fireEvent.pointerDown(cells[1]);
        fireEvent.click(screen.getByRole("button", { name: "Center note 2" }));
        fireEvent.pointerDown(cells[2]);
        expect(container.querySelectorAll(".note-flagged")).toHaveLength(0);
    });

    it("hides the Check button for puzzles with no declared solution", () => {
        render(<PuzzlePlayer puzzle={compiledWithZeroInDomain()} />);
        expect(screen.queryByRole("button", { name: /^check$/i })).toBeNull();
    });

    it("clicking Check first just reports a mistake, a second press reveals it, and fixing it clears the flag", () => {
        const { container } = render((
            <>
                <PuzzlePlayer puzzle={compiled()} />
                <ToastViewport />
            </>
        ));
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        const checkButton = () => screen.getByRole("button", { name: /^check$/i });

        fireEvent.pointerDown(cells[1]); // r1c2, solution digit is '2'
        fireEvent.click(screen.getByRole("button", { name: "3" })); // wrong
        expect(container.querySelectorAll(".digit.incorrect")).toHaveLength(0); // not checked yet

        fireEvent.click(checkButton()); // first press: toast only, nothing revealed
        expect(screen.queryByText(/digit entered is wrong/i)).not.toBeNull();
        expect(container.querySelectorAll(".digit.incorrect")).toHaveLength(0);

        fireEvent.click(checkButton()); // second press, no edit in between: reveals it
        expect(container.querySelectorAll(".digit.incorrect")).toHaveLength(1);

        fireEvent.click(screen.getByRole("button", { name: "2" })); // fix it
        expect(container.querySelectorAll(".digit.incorrect")).toHaveLength(0);
    });

    it("the 'V' hotkey runs the same two-stage check as the Check button", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");

        fireEvent.pointerDown(cells[1]);
        fireEvent.click(screen.getByRole("button", { name: "3" })); // wrong
        fireEvent.keyDown(root(), { key: "v" });
        expect(container.querySelectorAll(".digit.incorrect")).toHaveLength(0);
        fireEvent.keyDown(root(), { key: "v" });
        expect(container.querySelectorAll(".digit.incorrect")).toHaveLength(1);
    });

    it("announces the cursor cell in a live region, since the SVG board has no per-cell DOM (#64)", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");
        fireEvent.pointerDown(cells[1]);
        const region = container.querySelector('[aria-live="polite"]') as HTMLElement;
        expect(region.textContent).toMatch(/^Row 1, column 2: /);
    });

    it("Check reports 'everything is correct' when the board has no mistakes", () => {
        render((
            <>
                <PuzzlePlayer puzzle={compiled()} />
                <ToastViewport />
            </>
        ));
        fireEvent.click(screen.getByRole("button", { name: /^check$/i }));
        expect(screen.queryByText(/everything is correct/i)).not.toBeNull();
    });

    it("reports a note mistake separately from a wrong value, and doesn't mention 'digit entered'", () => {
        const { container } = render((
            <>
                <PuzzlePlayer puzzle={compiled()} />
                <ToastViewport />
            </>
        ));
        const cells = container.querySelectorAll<SVGRectElement>(".cell-bg");

        fireEvent.pointerDown(cells[1]); // r1c2, solution digit is '2'
        fireEvent.click(screen.getByRole("button", { name: /^Center$/ }));
        fireEvent.click(screen.getByRole("button", { name: "Center note 1" }));
        fireEvent.click(screen.getByRole("button", { name: "Center note 3" })); // candidates {1,3} — missing '2'

        fireEvent.click(screen.getByRole("button", { name: /^check$/i }));
        expect(screen.queryByText(/eliminated the correct digit/i)).not.toBeNull();
        expect(screen.queryByText(/digit entered is wrong/i)).toBeNull();
    });

    it("hides the keyboard shortcut legend by default, revealed via a toggle", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        expect(container.querySelector(".hk-row")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: /keyboard shortcuts/i }));
        expect(container.querySelector(".hk-row")).not.toBeNull();

        fireEvent.click(screen.getByRole("button", { name: /hide shortcuts/i }));
        expect(container.querySelector(".hk-row")).toBeNull();
    });

    it("types a multi-digit value for domains past 1-9, each keystroke showing immediately", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiledWithLargeDomain()} />);
        fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[0]);

        // "1" alone is ambiguous (could become 1, or 10-19) — but it's shown right
        // away rather than waiting to see if a second digit follows.
        fireEvent.keyDown(root(), { key: "1" });
        let entered = container.querySelectorAll(".digit.entered");
        expect(entered).toHaveLength(1);
        expect(entered[0].textContent).toBe("1");

        // "10" can't be extended any further within a 1-25 domain — the second
        // keystroke corrects the preview immediately.
        fireEvent.keyDown(root(), { key: "0" });
        entered = container.querySelectorAll(".digit.entered");
        expect(entered).toHaveLength(1);
        expect(entered[0].textContent).toBe("10");
    });

    it("a lone ambiguous digit is shown immediately and stays put once the pause elapses", () => {
        vi.useFakeTimers();
        try {
            const { container } = render(<PuzzlePlayer puzzle={compiledWithLargeDomain()} />);
            fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[0]);

            fireEvent.keyDown(root(), { key: "2" }); // could still become 2, or 20-25
            let entered = container.querySelectorAll(".digit.entered");
            expect(entered).toHaveLength(1);
            expect(entered[0].textContent).toBe("2");

            act(() => {
                vi.advanceTimersByTime(600);
            });
            entered = container.querySelectorAll(".digit.entered");
            expect(entered).toHaveLength(1);
            expect(entered[0].textContent).toBe("2");
        } finally {
            vi.useRealTimers();
        }
    });

    it("typing a multi-digit value is a single undo step, not one per keystroke", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiledWithLargeDomain()} />);
        fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[0]);

        fireEvent.keyDown(root(), { key: "1" });
        fireEvent.keyDown(root(), { key: "0" });
        expect(container.querySelectorAll(".digit.entered")[0]?.textContent).toBe("10");

        fireEvent.keyDown(root(), { key: "z", ctrlKey: true });
        expect(container.querySelectorAll(".digit.entered")).toHaveLength(0);
    });

    it("a NumberPad click cancels a still-pending typed digit, instead of it landing later and overwriting the click", () => {
        vi.useFakeTimers();
        try {
            const { container } = render(<PuzzlePlayer puzzle={compiledWithLargeDomain()} />);
            fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[0]);

            fireEvent.keyDown(root(), { key: "2" }); // pending, awaiting a possible second digit
            fireEvent.click(screen.getByRole("button", { name: "15" }));
            expect(container.querySelectorAll(".digit.entered")[0]?.textContent).toBe("15");

            // if the stale "2" buffer were still live, this would stomp the click.
            act(() => {
                vi.advanceTimersByTime(600);
            });
            expect(container.querySelectorAll(".digit.entered")[0]?.textContent).toBe("15");
        } finally {
            vi.useRealTimers();
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

    it("the solve timer ticks up once a second while the puzzle is open", () => {
        vi.useFakeTimers();
        try {
            render(<PuzzlePlayer puzzle={compiled()} />);
            expect(screen.getByText("0:00")).toBeTruthy();
            act(() => {
                vi.advanceTimersByTime(3000);
            });
            expect(screen.getByText("0:03")).toBeTruthy();
        } finally {
            vi.useRealTimers();
        }
    });

    it("freezes the timer and records a personal best the moment the puzzle is solved", () => {
        vi.useFakeTimers();
        try {
            const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
            act(() => {
                vi.advanceTimersByTime(5000);
            });

            const solution = miniSudoku.solution as Record<string, number>;
            const cellEls = container.querySelectorAll<SVGRectElement>(".cell-bg");
            cellEls.forEach((el, i) => {
                const cell = `r${Math.floor(i / 4) + 1}c${(i % 4) + 1}`;
                if (cell in (miniSudoku.givens ?? {})) return;
                fireEvent.pointerDown(el);
                fireEvent.click(screen.getByRole("button", { name: String(solution[cell]) }));
            });

            expect(screen.getByText("0:05")).toBeTruthy();
            expect(screen.getByText("best 0:05")).toBeTruthy();

            // Further ticks don't move it — the timer is stopped, not just paused.
            act(() => {
                vi.advanceTimersByTime(5000);
            });
            expect(screen.getByText("0:05")).toBeTruthy();

            const stats = JSON.parse(localStorage.getItem(statsStorageKey("mini-sudoku")) ?? "{}") as PuzzleStats;
            expect(stats.elapsedMs).toBe(5000);
            expect(stats.bestElapsedMs).toBe(5000);
        } finally {
            vi.useRealTimers();
        }
    });

    it("resumes a persisted elapsed time instead of restarting at zero", () => {
        localStorage.setItem(statsStorageKey("mini-sudoku"), JSON.stringify({ elapsedMs: 42_000 } satisfies PuzzleStats));
        render(<PuzzlePlayer puzzle={compiled()} />);
        expect(screen.getByText("0:42")).toBeTruthy();
    });

    it("Reset restarts the timer at zero and it keeps ticking afterward", () => {
        vi.useFakeTimers();
        try {
            const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
            act(() => {
                vi.advanceTimersByTime(7000);
            });
            expect(screen.getByText("0:07")).toBeTruthy();

            fireEvent.pointerDown(container.querySelectorAll<SVGRectElement>(".cell-bg")[1]);
            fireEvent.click(screen.getByRole("button", { name: "More actions" }));
            fireEvent.click(screen.getByRole("menuitem", { name: "Reset puzzle" }));
            fireEvent.click(screen.getByRole("menuitem", { name: "Really clear everything?" }));
            expect(screen.getByText("0:00")).toBeTruthy();

            act(() => {
                vi.advanceTimersByTime(2000);
            });
            expect(screen.getByText("0:02")).toBeTruthy();
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("<PuzzlePlayer /> stacked (phone) layout", () => {
    const stubStacked = () =>
        vi.stubGlobal("matchMedia", (query: string) => ({
            matches: true,
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        }));
    afterEach(() => vi.unstubAllGlobals());

    it("drops the row under the grid and offers the timer and zoom in the pad's menu", () => {
        stubStacked();
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        expect(container.querySelector(".board-footer")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "More actions" }));
        expect(screen.getByRole("menuitem", { name: /^0:00/ })).toBeTruthy();
        for (const name of ["Zoom in", "Zoom out", "Fit to screen", "Actual size", "Lock zoom", "Reset puzzle"]) {
            expect(screen.getByRole("menuitem", { name })).toBeTruthy();
        }
    });

    it("zoom items drive the board: Lock zoom flips to Unlock zoom", () => {
        stubStacked();
        render(<PuzzlePlayer puzzle={compiled()} />);
        fireEvent.click(screen.getByRole("button", { name: "More actions" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "Lock zoom" }));
        fireEvent.click(screen.getByRole("button", { name: "More actions" }));
        expect(screen.getByRole("menuitem", { name: "Unlock zoom" })).toBeTruthy();
    });

    it("runs every zoom item from the menu without error", () => {
        stubStacked();
        render(<PuzzlePlayer puzzle={compiled()} />);
        for (const name of ["Zoom in", "Zoom out", "Fit to screen", "Actual size"]) {
            fireEvent.click(screen.getByRole("button", { name: "More actions" }));
            fireEvent.click(screen.getByRole("menuitem", { name }));
        }
        expect(screen.getByRole("button", { name: "More actions" })).toBeTruthy();
    });

    it("keeps the row under the grid (timer, hint, zoom) on a wide layout", () => {
        const { container } = render(<PuzzlePlayer puzzle={compiled()} />);
        expect(container.querySelector(".board-footer")).not.toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "More actions" }));
        expect(screen.queryByRole("menuitem", { name: "Zoom in" })).toBeNull();
    });
});
