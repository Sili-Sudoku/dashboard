import { describe, expect, it } from "vitest";

import { EMPTY_CELL, boardToProgress, progressEntryToState, toggleSet } from "@/runtime/cell_state.ts";
import { MARK_COLOR_COUNT } from "@/runtime/mark_colors.ts";
import type { CellState } from "@/runtime/session_types.ts";

describe("toggleSet", () => {
    it("adds a digit that is missing and keeps the notes sorted", () => {
        expect(toggleSet([1, 5], 3)).toEqual([1, 3, 5]);
        expect(toggleSet([], 4)).toEqual([4]);
    });
    it("removes a digit that is there", () => {
        expect(toggleSet([1, 3, 5], 3)).toEqual([1, 5]);
        expect(toggleSet([2], 2)).toEqual([]);
    });
    it("sorts numbers by value, not as text", () => {
        expect(toggleSet([2, 10], 9)).toEqual([2, 9, 10]);
    });
    it("does not change its input", () => {
        const input = [1, 2];
        toggleSet(input, 3);
        expect(input).toEqual([1, 2]);
    });
});

describe("boardToProgress", () => {
    const cell = (patch: Partial<CellState>): CellState => ({ ...EMPTY_CELL, ...patch });

    it("saves nothing for an empty board or for empty cells", () => {
        expect(boardToProgress(new Map())).toEqual({});
        expect(boardToProgress(new Map([["r1c1", EMPTY_CELL]]))).toEqual({});
    });

    it("saves a value, and leaves out the notes under it", () => {
        const board = new Map([["r1c1", cell({ value: 5, notes: [1], centerNotes: [2] })]]);
        expect(boardToProgress(board)).toEqual({ r1c1: { value: 5 } });
    });

    it("saves notes and colours of a cell without a value", () => {
        const board = new Map([["r2c2", cell({ notes: [1, 2], centerNotes: [3], colors: [4] })]]);
        expect(boardToProgress(board)).toEqual({ r2c2: { notes: [1, 2], centerNotes: [3], colors: [4] } });
    });

    it("keeps the colours of a cell that has a value", () => {
        const board = new Map([["r1c1", cell({ value: 2, colors: [0, 3] })]]);
        expect(boardToProgress(board)).toEqual({ r1c1: { value: 2, colors: [0, 3] } });
    });

    it("saves a placed zero (a value of 0 is a value)", () => {
        expect(boardToProgress(new Map([["r1c1", cell({ value: 0 })]]))).toEqual({ r1c1: { value: 0 } });
    });
});

describe("progressEntryToState", () => {
    const domain = [1, 2, 3, 4];

    it("reads a value inside the domain", () => {
        expect(progressEntryToState({ value: 3 }, domain)).toEqual({
            value: 3,
            notes: [],
            centerNotes: [],
            colors: [],
        });
    });

    it("drops a value outside the domain, and keeps the notes next to it", () => {
        expect(progressEntryToState({ value: 9, notes: [2, 1] }, domain)).toEqual({
            value: null,
            notes: [1, 2],
            centerNotes: [],
            colors: [],
        });
        expect(progressEntryToState({ value: 9 }, domain)).toBeNull();
    });

    it("ignores notes next to a valid value", () => {
        expect(progressEntryToState({ value: 2, notes: [1], centerNotes: [3] }, domain)).toMatchObject({
            value: 2,
            notes: [],
            centerNotes: [],
        });
    });

    it("sorts notes and centre notes", () => {
        expect(progressEntryToState({ notes: [4, 1], centerNotes: [3, 2] }, domain)).toMatchObject({
            notes: [1, 4],
            centerNotes: [2, 3],
        });
    });

    it("keeps only real colour indices, once each and sorted", () => {
        const colors = [3, 1, 1, -1, 1.5, MARK_COLOR_COUNT, 0];
        expect(progressEntryToState({ colors }, domain)).toMatchObject({ value: null, colors: [0, 1, 3] });
    });

    it("keeps colours alongside a value", () => {
        expect(progressEntryToState({ value: 1, colors: [2] }, domain)).toMatchObject({ value: 1, colors: [2] });
    });

    it("returns null when nothing is left", () => {
        expect(progressEntryToState({}, domain)).toBeNull();
        expect(progressEntryToState({ notes: [], centerNotes: [], colors: [] }, domain)).toBeNull();
        expect(progressEntryToState({ colors: [-5] }, domain)).toBeNull();
    });

    it("round-trips what boardToProgress saves", () => {
        const board = new Map<string, CellState>([
            ["r1c1", { value: 4, notes: [], centerNotes: [], colors: [1] }],
            ["r1c2", { value: null, notes: [1, 2], centerNotes: [3], colors: [] }],
        ]);
        const saved = boardToProgress(board);
        for (const [cell, state] of board) expect(progressEntryToState(saved[cell], domain)).toEqual(state);
    });
});
