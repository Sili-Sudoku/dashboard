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
        session.setNoteMode(true);
        session.input(2);
        session.input(4);
        expect(session.cellState("r1c2").notes).toEqual([2, 4]);
        session.input(2);
        expect(session.cellState("r1c2").notes).toEqual([4]);
        session.setNoteMode(false);
        session.input(3);
        expect(session.cellState("r1c2")).toEqual({ value: 3, notes: [] });
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

    it("moves a keyboard cursor and stops at edges", () => {
        session.select("r1c1");
        session.moveCursor("right");
        expect(session.getCursor()).toBe("r1c2");
        session.moveCursor("up");
        expect(session.getCursor()).toBe("r1c2");
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
        session.setNoteMode(true);
        session.input(4);
        const snapshot = session.toProgress();

        const restored = new PuzzleSession(compiled(), { initialProgress: snapshot });
        expect(restored.valueOf("r1c2")).toBe(2);
        expect(restored.cellState("r1c3").notes).toEqual([4]);
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
