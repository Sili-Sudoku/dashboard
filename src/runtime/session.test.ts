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
