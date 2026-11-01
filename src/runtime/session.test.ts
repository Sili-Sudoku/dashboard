import { beforeEach, describe, expect, it, vi } from "vitest";
import { compilePuzzle } from "@/runtime/compile.ts";
import { PuzzleSession } from "@/runtime/session.ts";
import type { CompiledPuzzle } from "@/runtime/puzzle.ts";

const compiled = (): CompiledPuzzle => {
    const result = compilePuzzle({
        version: 1,
        metadata: { id: "s", title: "s" },
        geometry: { type: "grid", width: 4, height: 4, boxWidth: 2, boxHeight: 2 },
        domain: { values: [1, 2, 3, 4] },
        givens: { r1c1: 1 },
        constraints: [["allDifferent", ["cells", "row:0"]]],
    });
    if (result instanceof Error) throw result;
    return result;
};

const compiledWithSolution = (): CompiledPuzzle => {
    const result = compilePuzzle({
        version: 1,
        metadata: { id: "s2", title: "s2" },
        geometry: { type: "grid", width: 4, height: 4, boxWidth: 2, boxHeight: 2 },
        domain: { values: [1, 2, 3, 4] },
        givens: { r1c1: 1 },
        solution: {
            r1c1: 1,
            r1c2: 2,
            r1c3: 3,
            r1c4: 4,
            r2c1: 3,
            r2c2: 4,
            r2c3: 1,
            r2c4: 2,
            r3c1: 2,
            r3c2: 1,
            r3c3: 4,
            r3c4: 3,
            r4c1: 4,
            r4c2: 3,
            r4c3: 2,
            r4c4: 1,
        },
        constraints: [["allDifferent", ["cells", "row:0"]]],
    });
    if (result instanceof Error) throw result;
    return result;
};

describe("PuzzleSession", () => {
    let session: PuzzleSession;

    beforeEach(() => {
        session = new PuzzleSession(compiled());
    });

    it("notifies subscribers on change", () => {
        const listener = vi.fn();
        session.subscribe(listener);
        session.select("r1c2");
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("enters values into the selection but never into givens", () => {
        session.select("r1c2");
        session.input(3);
        expect(session.valueOf("r1c2")).toBe(3);

        session.select("r1c1");
        session.input(9);
        expect(session.valueOf("r1c1")).toBe(1);
    });

    it("ignores values outside the domain", () => {
        session.select("r1c2");
        session.input(7);
        expect(session.valueOf("r1c2")).toBeNull();
    });

    it("toggles pencil marks in note mode and clears them when a value lands", () => {
        session.select("r1c2");
        session.setInputMode("corner");
        session.input(2);
        session.input(4);
        expect(session.cellState("r1c2").notes).toEqual([2, 4]);
        session.input(2);
        expect(session.cellState("r1c2").notes).toEqual([4]);
        session.setInputMode("digit");
        session.input(3);
        expect(session.cellState("r1c2")).toEqual({ value: 3, notes: [], centerNotes: [] });
    });

    it("input() applies centre notes while in center mode", () => {
        session.select("r1c2");
        session.setInputMode("center");
        session.input(2);
        session.input(4);
        expect(session.cellState("r1c2").centerNotes).toEqual([2, 4]);
        expect(session.cellState("r1c2").notes).toEqual([]);
    });

    it("toggles corner and centre notes directly, independent of inputMode", () => {
        session.select("r1c2");
        expect(session.inputMode).toBe("digit");

        session.toggleCornerNote(2);
        session.toggleCornerNote(4);
        session.toggleCenterNote(4);
        expect(session.cellState("r1c2").notes).toEqual([2, 4]);
        expect(session.cellState("r1c2").centerNotes).toEqual([4]);

        session.toggleCornerNote(2);
        expect(session.cellState("r1c2").notes).toEqual([4]);
        expect(session.cellState("r1c2").centerNotes).toEqual([4]);
    });

    it("ignores direct note toggles on cells holding a value or on givens", () => {
        session.select("r1c2");
        session.input(3);
        session.toggleCornerNote(5);
        expect(session.cellState("r1c2")).toEqual({ value: 3, notes: [], centerNotes: [] });

        session.select("r1c1"); // given
        session.toggleCenterNote(2);
        expect(session.cellState("r1c1").centerNotes).toEqual([]);
    });

    it("applies input to every selected non-given cell", () => {
        session.select("r2c1");
        session.select("r2c2", "add");
        session.input(4);
        expect(session.valueOf("r2c1")).toBe(4);
        expect(session.valueOf("r2c2")).toBe(4);
    });

    it("supports undo/redo across mutations", () => {
        session.select("r1c2");
        session.input(2);
        session.input(3);
        expect(session.valueOf("r1c2")).toBe(3);

        session.undo();
        expect(session.valueOf("r1c2")).toBe(2);
        session.undo();
        expect(session.valueOf("r1c2")).toBeNull();
        expect(session.canUndo).toBe(false);

        session.redo();
        expect(session.valueOf("r1c2")).toBe(2);
    });

    it("undo restores a cell's exact prior notes, not just a blank value", () => {
        session.select("r1c2");
        session.toggleCornerNote(1);
        session.toggleCornerNote(3);
        session.input(2); // overwrites the notes with a value

        session.undo();
        expect(session.cellState("r1c2")).toEqual({ value: null, notes: [1, 3], centerNotes: [] });
    });

    it("undo of an edit that deleted a cell's entry restores it, not a stray empty one", () => {
        session.select("r1c2");
        session.input(2);
        session.erase(); // value cleared with no notes left -> the board entry itself is deleted

        session.undo();
        expect(session.valueOf("r1c2")).toBe(2);
        session.redo();
        expect(session.valueOf("r1c2")).toBeNull();
    });

    it("undoes a multi-cell edit by restoring each cell's own independent prior state", () => {
        session.select("r1c2");
        session.input(1); // r1c2 starts with a value...
        session.select("r1c3");
        session.toggleCornerNote(1); // ...r1c3 starts with a note...
        // r1c4 starts empty

        session.select("r1c2");
        session.select("r1c3", "add");
        session.select("r1c4", "add");
        session.input(3); // overwrite all three with the same value in one patch

        session.undo();
        expect(session.cellState("r1c2")).toEqual({ value: 1, notes: [], centerNotes: [] });
        expect(session.cellState("r1c3")).toEqual({ value: null, notes: [1], centerNotes: [] });
        expect(session.cellState("r1c4")).toEqual({ value: null, notes: [], centerNotes: [] });
    });

    it("erase only clears the layer matching the active input mode", () => {
        session.select("r1c2");
        session.toggleCornerNote(1);
        session.toggleCenterNote(2);
        expect(session.cellState("r1c2")).toEqual({ value: null, notes: [1], centerNotes: [2] });

        session.setInputMode("digit");
        session.erase(); // nothing to erase on the value layer
        expect(session.cellState("r1c2")).toEqual({ value: null, notes: [1], centerNotes: [2] });

        session.setInputMode("corner");
        session.erase();
        expect(session.cellState("r1c2")).toEqual({ value: null, notes: [], centerNotes: [2] });

        session.setInputMode("center");
        session.erase();
        expect(session.cellState("r1c2")).toEqual({ value: null, notes: [], centerNotes: [] });
    });

    it("erase on the digit layer clears the value but leaves notes untouched", () => {
        session.select("r1c3");
        session.setInputMode("digit");
        session.input(3);
        session.toggleCornerNote(1); // value is set, so this note toggle is a no-op (cell holds a value)
        session.erase();
        expect(session.cellState("r1c3")).toEqual({ value: null, notes: [], centerNotes: [] });
    });

    it("moves a keyboard cursor and stops at edges", () => {
        session.select("r1c1");
        session.moveCursor("right");
        expect(session.getCursor()).toBe("r1c2");
        session.moveCursor("up");
        expect(session.getCursor()).toBe("r1c2");
    });

    it("selectNone clears the cursor too, so nothing stays visibly highlighted", () => {
        session.select("r1c2");
        expect(session.getCursor()).toBe("r1c2");
        expect(session.getSelection()).toEqual(new Set(["r1c2"]));

        session.selectNone();
        expect(session.getCursor()).toBeNull();
        expect(session.getSelection()).toEqual(new Set());
    });

    it("moveCursor re-anchors on the first cell after selectNone, instead of no-op", () => {
        session.select("r2c2");
        session.selectNone();
        session.moveCursor("right");
        expect(session.getCursor()).toBe("r1c1");
    });

    it("selects every cell sharing the cursor cell's value", () => {
        session.select("r1c2");
        session.input(3);
        session.select("r2c1");
        session.input(3);
        session.select("r3c3");
        session.input(3);

        session.select("r1c2"); // cursor back on one of the '3' cells
        session.selectSameValue();
        expect([...session.getSelection()].sort()).toEqual(["r1c2", "r2c1", "r3c3"].sort());
    });

    it("selectSameValue is a no-op when the cursor cell is empty", () => {
        session.select("r1c2");
        session.selectSameValue();
        expect(session.getSelection()).toEqual(new Set(["r1c2"]));
    });

    it("jumps to the next/previous empty cell, wrapping around the board", () => {
        session.select("r1c1"); // a given, but still a valid cursor position
        session.jumpToEmptyCell(1);
        expect(session.getCursor()).toBe("r1c2");

        session.select("r1c1");
        session.jumpToEmptyCell(-1);
        expect(session.getCursor()).toBe("r4c4"); // wraps past the start to the last cell
    });

    it("jumpToEmptyCell without wrap stops at the ends and reports it", () => {
        session.select("r4c4");
        expect(session.jumpToEmptyCell(1, false)).toBe(false);
        expect(session.getCursor()).toBe("r4c4");
        session.select("r1c1");
        expect(session.jumpToEmptyCell(-1, false)).toBe(false);
        expect(session.jumpToEmptyCell(1, false)).toBe(true);
        expect(session.getCursor()).toBe("r1c2");
    });

    it("jumpToEmptyCell skips over filled cells", () => {
        session.select("r1c2");
        session.input(2);
        session.select("r1c1");
        session.jumpToEmptyCell(1);
        expect(session.getCursor()).toBe("r1c3"); // r1c2 is now filled
    });

    it("jumpToEmptyCell searches from the start when there is no cursor", () => {
        session.selectNone();
        expect(session.getCursor()).toBeNull();
        session.jumpToEmptyCell(1);
        expect(session.getCursor()).toBe("r1c2"); // r1c1 is a given, so the first empty cell
    });

    it("memoises evaluation and refreshes it after a change", () => {
        const first = session.evaluation;
        expect(session.evaluation).toBe(first);
        session.select("r1c2");
        session.input(1);
        const second = session.evaluation;
        expect(second).not.toBe(first);
        expect(second.constraints[0].status).toBe("violated"); // r1c1 given is also 1
    });

    it("does not recompute evaluation for selection/cursor moves or note toggles — only value edits", () => {
        const first = session.evaluation;
        session.select("r1c3");
        session.moveCursor("right");
        session.setInputMode("corner");
        session.toggleCornerNote(2); // a note, not a value — doesn't affect any constraint
        session.setInputMode("digit");
        expect(session.evaluation).toBe(first);
    });

    it("round-trips progress snapshots", () => {
        session.select("r1c2");
        session.input(2);
        session.select("r1c3");
        session.setInputMode("corner");
        session.input(4);
        session.toggleCenterNote(1);
        const snapshot = session.toProgress();

        const restored = new PuzzleSession(compiled(), { initialProgress: snapshot });
        expect(restored.valueOf("r1c2")).toBe(2);
        expect(restored.cellState("r1c3").notes).toEqual([4]);
        expect(restored.cellState("r1c3").centerNotes).toEqual([1]);
    });

    it("reset clears entered values but is undoable", () => {
        session.select("r1c2");
        session.input(2);
        session.reset();
        expect(session.valueOf("r1c2")).toBeNull();
        session.undo();
        expect(session.valueOf("r1c2")).toBe(2);
    });
});

describe("PuzzleSession — incremental evaluation", () => {
    // Two disjoint constraints (row:0, row:1) so an edit to row 0 should never
    // disturb row 1's cached result.
    const twoRows = (): CompiledPuzzle => {
        const result = compilePuzzle({
            version: 1,
            metadata: { id: "tr", title: "tr" },
            geometry: { type: "grid", width: 4, height: 4, boxWidth: 2, boxHeight: 2 },
            domain: { values: [1, 2, 3, 4] },
            constraints: [
                ["allDifferent", ["cells", "row:0"]],
                ["allDifferent", ["cells", "row:1"]],
            ],
        });
        if (result instanceof Error) throw result;
        return result;
    };

    it("reuses the other constraint's cached result object when only one row is edited", () => {
        const session = new PuzzleSession(twoRows());
        const before = session.evaluation;

        session.select("r1c1");
        session.input(1);
        const after = session.evaluation;

        expect(after.constraints[0]).not.toBe(before.constraints[0]); // row:0 — edited, recomputed
        expect(after.constraints[1]).toBe(before.constraints[1]); // row:1 — untouched, same reference
    });

    it("undo forces a full recompute that's still correct, not stale from the pre-undo board", () => {
        const session = new PuzzleSession(twoRows());
        session.select("r1c1");
        session.input(1);
        session.select("r1c2");
        session.input(1); // duplicate within row:0 -> violated
        expect(session.evaluation.constraints[0].status).toBe("violated");

        session.undo(); // back to just r1c1=1 -> no duplicate anymore
        expect(session.evaluation.constraints[0].status).toBe("incomplete");
    });
});

describe("PuzzleSession — checkNotesOnLeave", () => {
    let session: PuzzleSession;

    beforeEach(() => {
        session = new PuzzleSession(compiledWithSolution());
        session.setCheckNotesOnLeave(true);
    });

    it("flags a cell on leave if its remaining centre notes dropped the solution digit", () => {
        session.select("r1c2"); // solution digit here is 2
        session.toggleCenterNote(1);
        session.toggleCenterNote(3); // candidates {1,3} — missing the correct '2'
        session.select("r1c3"); // leaving r1c2
        expect(session.getFlaggedCells()).toEqual(new Set(["r1c2"]));
    });

    it("does not flag a cell whose centre notes still include the solution digit", () => {
        session.select("r1c2");
        session.toggleCenterNote(1);
        session.toggleCenterNote(2); // correct digit still present
        session.select("r1c3");
        expect(session.getFlaggedCells().size).toBe(0);
    });

    it("does not check corner notes at all — they're scratch work, not a per-cell candidate list", () => {
        session.select("r1c2"); // solution digit here is 2
        session.toggleCornerNote(1);
        session.toggleCornerNote(3); // would exclude '2' if this were a centre note
        session.select("r1c3");
        expect(session.getFlaggedCells().size).toBe(0);
    });

    it("does not flag an untouched cell with no notes at all", () => {
        session.select("r1c2");
        session.select("r1c3"); // leave without ever adding a note
        expect(session.getFlaggedCells().size).toBe(0);
    });

    it("re-checks on every leave, clearing a flag once the digit is restored", () => {
        session.select("r1c2");
        session.toggleCenterNote(1);
        session.toggleCenterNote(3);
        session.select("r1c3");
        expect(session.getFlaggedCells()).toEqual(new Set(["r1c2"]));

        session.select("r1c2");
        session.toggleCenterNote(2); // add the correct digit back
        session.select("r1c3");
        expect(session.getFlaggedCells().size).toBe(0);
    });

    it("never flags a cell once it holds a value", () => {
        session.select("r1c2");
        session.toggleCenterNote(1); // wrong candidate only
        session.input(2); // now fill in the (correct) value — clears notes
        session.select("r1c3");
        expect(session.getFlaggedCells().size).toBe(0);
    });

    it("is off by default and checks nothing until enabled", () => {
        const fresh = new PuzzleSession(compiledWithSolution());
        fresh.select("r1c2");
        fresh.toggleCenterNote(1);
        fresh.toggleCenterNote(3);
        fresh.select("r1c3");
        expect(fresh.getFlaggedCells().size).toBe(0);
    });

    it("clears all flags immediately when disabled", () => {
        session.select("r1c2");
        session.toggleCenterNote(1);
        session.toggleCenterNote(3);
        session.select("r1c3");
        expect(session.getFlaggedCells().size).toBe(1);

        session.setCheckNotesOnLeave(false);
        expect(session.getFlaggedCells().size).toBe(0);
    });
});

describe("PuzzleSession — checkAgainstSolution", () => {
    let session: PuzzleSession;

    beforeEach(() => {
        session = new PuzzleSession(compiledWithSolution()); // r1c2's solution digit is 2
    });

    it("does not flag a placed value that matches the solution", () => {
        session.select("r1c2");
        session.input(2);
        expect(session.checkAgainstSolution()).toBe("clean");
        expect(session.getIncorrectCells().size).toBe(0);
    });

    it("never flags a given, even though checking is otherwise unconditional", () => {
        expect(session.checkAgainstSolution()).toBe("clean");
        expect(session.getIncorrectCells().has("r1c1")).toBe(false);
        expect(session.getFlaggedCells().has("r1c1")).toBe(false);
    });

    it("is a no-op when the puzzle has no declared solution", () => {
        const noSolution = new PuzzleSession(compiled());
        noSolution.select("r1c2");
        noSolution.input(3);
        expect(noSolution.checkAgainstSolution()).toBe("clean");
        expect(noSolution.getIncorrectCells().size).toBe(0);
    });

    it("does not check corner notes — they're scratch work, not a per-cell candidate list", () => {
        session.select("r1c2");
        session.toggleCornerNote(1);
        session.toggleCornerNote(3); // would exclude '2' if this were a centre note
        expect(session.checkAgainstSolution()).toBe("clean");
        expect(session.getFlaggedCells().size).toBe(0);
    });

    describe("two-stage reveal", () => {
        it("the first press reports a wrong value without revealing which cell", () => {
            session.select("r1c2");
            session.input(3); // wrong — solution is 2
            expect(session.checkAgainstSolution()).toBe("mistake-value");
            expect(session.getIncorrectCells().size).toBe(0);
        });

        it("the first press reports a note mistake, separately from a wrong value", () => {
            session.select("r1c2");
            session.toggleCenterNote(1);
            session.toggleCenterNote(3); // candidates {1,3} — missing the correct '2'
            expect(session.checkAgainstSolution()).toBe("mistake-notes");
            expect(session.getFlaggedCells().size).toBe(0);
        });

        it("a wrong value takes precedence over a note mistake when both are present", () => {
            session.select("r1c3"); // solution digit here is 3
            session.toggleCenterNote(1);
            session.toggleCenterNote(2); // candidates {1,2} — missing the correct '3'
            session.select("r1c2"); // solution digit here is 2
            session.input(4); // wrong
            expect(session.checkAgainstSolution()).toBe("mistake-value");
        });

        it("a second consecutive press (no edit in between) reveals the cell", () => {
            session.select("r1c2");
            session.input(3); // wrong
            session.checkAgainstSolution(); // first press — hidden
            expect(session.checkAgainstSolution()).toBe("revealed");
            expect(session.getIncorrectCells()).toEqual(new Set(["r1c2"]));
        });

        it("reveals centre notes that have eliminated the correct digit, same check as checkNotesOnLeave", () => {
            session.select("r1c2");
            session.toggleCenterNote(1);
            session.toggleCenterNote(3); // candidates {1,3} — missing the correct '2'
            session.checkAgainstSolution(); // first press — hidden
            expect(session.checkAgainstSolution()).toBe("revealed");
            expect(session.getFlaggedCells()).toEqual(new Set(["r1c2"]));
        });

        it("an edit between presses resets back to the hidden first-press stage", () => {
            session.select("r1c2");
            session.input(3); // wrong
            session.checkAgainstSolution(); // armed
            session.erase();
            session.input(3); // still wrong, but this edit disarmed the reveal
            expect(session.checkAgainstSolution()).toBe("mistake-value");
            expect(session.getIncorrectCells().size).toBe(0);
        });

        it("clears a revealed cell's incorrect flag as soon as it's edited again, without a new check", () => {
            session.select("r1c2");
            session.input(3); // wrong
            session.checkAgainstSolution();
            session.checkAgainstSolution();
            expect(session.getIncorrectCells()).toEqual(new Set(["r1c2"]));

            session.input(2); // corrected — stale flag shouldn't linger until the next check
            expect(session.getIncorrectCells().size).toBe(0);
        });

        it("re-running the check replaces the previous results rather than accumulating them", () => {
            session.select("r1c2");
            session.input(3); // wrong
            session.checkAgainstSolution();
            session.checkAgainstSolution();
            expect(session.getIncorrectCells()).toEqual(new Set(["r1c2"]));

            session.select("r1c2");
            session.input(2); // fix it without going through erase/undo
            expect(session.checkAgainstSolution()).toBe("clean");
            expect(session.getIncorrectCells().size).toBe(0);
        });
    });
});

describe("PuzzleSession — fog", () => {
    // r1c1 (given, visible) - r1c2 (empty) / r2c1 (empty) - r2c2 (given, hidden).
    // r2c2 only reveals once a player-filled neighbor (r1c2 or r2c1) is correct.
    const compiledWithFog = (): CompiledPuzzle => {
        const result = compilePuzzle({
            version: 1,
            metadata: { id: "fog-session", title: "fog-session" },
            geometry: { type: "grid", width: 2, height: 2 },
            domain: { values: [1, 2] },
            givens: { r1c1: 1, r2c2: 1 },
            solution: { r1c1: 1, r1c2: 2, r2c1: 2, r2c2: 1 },
            fog: { hidden: ["r2c2"] },
            constraints: [],
        });
        if (result instanceof Error) throw result;
        return result;
    };

    it("lets the player type a guess into a still-hidden given, without disturbing its real value", () => {
        const session = new PuzzleSession(compiledWithFog());
        expect(session.getHiddenCells()).toEqual(new Set(["r2c2"]));

        session.select("r2c2");
        session.input(2); // a guess — wrong, as it happens (the real given is 1)

        // Shown to the player: their own guess.
        expect(session.displayState("r2c2").value).toBe(2);
        // What actually counts for evaluation/fog purposes: the real given, untouched.
        expect(session.valueOf("r2c2")).toBe(1);
    });

    it("also accepts notes on a still-hidden given, shown via displayState", () => {
        const session = new PuzzleSession(compiledWithFog());
        session.select("r2c2");
        session.toggleCornerNote(2);
        expect(session.displayState("r2c2").notes).toEqual([2]);
    });

    it("locks back to the real given and drops the player's guess once revealed", () => {
        const session = new PuzzleSession(compiledWithFog());
        session.select("r2c2");
        session.input(2); // guess, while still hidden

        session.select("r1c2");
        session.input(2); // correct — reveals r2c2 by propagation
        expect(session.getHiddenCells()).toEqual(new Set());

        // Now shown as the real given, not the earlier guess.
        expect(session.displayState("r2c2").value).toBe(1);

        // And immutable again, like any other revealed given.
        session.select("r2c2");
        session.input(1);
        expect(session.valueOf("r2c2")).toBe(1);
    });

    it("round-trips a guess in a still-hidden given through a progress snapshot", () => {
        const session = new PuzzleSession(compiledWithFog());
        session.select("r2c2");
        session.input(2);

        const restored = new PuzzleSession(compiledWithFog(), { initialProgress: session.toProgress() });
        expect(restored.displayState("r2c2").value).toBe(2);
    });
});
