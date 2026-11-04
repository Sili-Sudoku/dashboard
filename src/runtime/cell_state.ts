/** Pure helpers on the state of cells: notes, and the conversion between the board and saved progress. */

import type { CellId } from "@/runtime/geometry.ts";
import { MARK_COLOR_COUNT } from "@/runtime/mark_colors.ts";
import type { CellState, ProgressSnapshot } from "@/runtime/session_types.ts";

export const EMPTY_CELL: CellState = { value: null, notes: [], centerNotes: [], colors: [] };

/** Adds the digit to the notes, or takes it away when it is there. The result is sorted. */
export const toggleSet = (notes: readonly number[], digit: number): number[] => {
    const set = new Set(notes);
    if (set.has(digit)) set.delete(digit);
    else set.add(digit);
    return [...set].sort((a, b) => a - b);
};

/** The saved form of a board: entered cells only. A placed value hides the notes of its cell. */
export const boardToProgress = (board: ReadonlyMap<CellId, CellState>): ProgressSnapshot => {
    const out: Record<CellId, ProgressSnapshot[CellId]> = {};
    for (const [cell, state] of board) {
        const entry: {
            value?: number;
            notes?: readonly number[];
            centerNotes?: readonly number[];
            colors?: readonly number[];
        } = {};
        if (state.value !== null) entry.value = state.value;
        else {
            if (state.notes.length > 0) entry.notes = state.notes;
            if (state.centerNotes.length > 0) entry.centerNotes = state.centerNotes;
        }
        if (state.colors.length > 0) entry.colors = state.colors;
        if (Object.keys(entry).length > 0) out[cell] = entry;
    }
    return out;
};

/**
 * Reads one saved entry back into a cell state. Saved data is not trusted: a value outside the domain is dropped,
 * and colour marks must be real palette indices. Returns null when nothing is left to keep.
 */
export const progressEntryToState = (entry: ProgressSnapshot[CellId], domain: readonly number[]): CellState | null => {
    const colors = [
        ...new Set((entry.colors ?? []).filter((c) => Number.isInteger(c) && c >= 0 && c < MARK_COLOR_COUNT)),
    ].sort((a, b) => a - b);
    if (entry.value !== undefined && domain.includes(entry.value)) {
        return { value: entry.value, notes: [], centerNotes: [], colors };
    }
    const notes = entry.notes ? [...entry.notes].sort((a, b) => a - b) : [];
    const centerNotes = entry.centerNotes ? [...entry.centerNotes].sort((a, b) => a - b) : [];
    if (notes.length > 0 || centerNotes.length > 0 || colors.length > 0) {
        return { value: null, notes, centerNotes, colors };
    }
    return null;
};
