/**
 * PuzzleSession: interactive state on top of a compiled puzzle.
 *
 * This is deliberately generic — it deals in cell ids and a value domain, never
 * in "9x9" or "digits 1-9". It follows the reference project's pattern of a
 * plain class that owns mutable state and notifies subscribers, so a React hook
 * can bridge it with `useSyncExternalStore`.
 *
 * Responsibilities: selection + keyboard cursor, value/pencil-mark entry,
 * undo/redo, memoised constraint evaluation, and progress snapshots for storage.
 */

import type { CellId, Direction, Geometry } from "@/runtime/geometry.ts";
import { createGeometry } from "@/runtime/geometry.ts";
import type { CompiledPuzzle } from "@/runtime/puzzle.ts";
import { evaluate, evaluateIncremental, lookupFromRecord, type EvaluationResult } from "@/runtime/evaluate.ts";
import { hiddenCells } from "@/runtime/fog.ts";
import { MARK_COLOR_COUNT, markIndexForDigit } from "@/runtime/mark_colors.ts";
import {
    EMPTY_PEN,
    cycleMark,
    applyStroke,
    isPenEmpty,
    sanitizePen,
    type PenPoint,
    type PenState,
} from "@/runtime/pen.ts";

export interface CellState {
    value: number | null;
    /** Corner notes: rendered as a fixed per-digit grid. */
    notes: readonly number[];
    /** Centre (candidate) notes: rendered as a compact growing list. */
    centerNotes: readonly number[];
    /** Colour marks (#35): palette indices, ascending. An independent layer — digits and notes never touch it. */
    colors: readonly number[];
}

const EMPTY_CELL: CellState = { value: null, notes: [], centerNotes: [], colors: [] };

/**
 * One undo/redo step. Per-cell edits (typing, notes, erase) are the hot
 * path — one per keystroke — so they're recorded as a `patch`: just the
 * touched cells' prior state, not the whole board. `undefined` means the
 * cell had no entry at all (restoring it means deleting it, not setting it
 * to an empty `CellState`, matching how `erase()` itself cleans up).
 * `reset`/`loadProgress` replace the board wholesale and are rare, one-shot
 * actions, so a `full` snapshot stays simplest there — diffing "every cell
 * that could differ" wouldn't save anything on an operation that's already
 * O(board size) by nature.
 */
type HistoryEntry =
    | { kind: "patch"; patch: ReadonlyMap<CellId, CellState | undefined> }
    | { kind: "pen"; pen: PenState }
    | { kind: "full"; snapshot: string };

const toggleSet = (notes: readonly number[], digit: number): number[] => {
    const set = new Set(notes);
    if (set.has(digit)) set.delete(digit);
    else set.add(digit);
    return [...set].sort((a, b) => a - b);
};

/** Compact, serialisable player progress (entered cells only). */
export type ProgressSnapshot = Readonly<
    Record<
        CellId,
        { value?: number; notes?: readonly number[]; centerNotes?: readonly number[]; colors?: readonly number[] }
    >
>;

export type SelectMode = "replace" | "add" | "toggle";

export interface SessionOptions {
    onChange?: () => void;
    initialProgress?: ProgressSnapshot;
    /** Seeds `checkNotesOnLeave` (default false) — the player-wide default lives in Settings (#69). */
    checkNotesOnLeave?: boolean;
    /** The saved pen layer (#45) — kept apart from `initialProgress`, whose keys are cells. */
    initialPen?: PenState;
}

/**
 * What a plain digit press (number pad click or keyboard digit) does. In
 * "color" mode the digit picks a palette colour (1-based) instead of a value.
 */
export type InputMode = "digit" | "corner" | "center" | "color" | "pen";

/**
 * Outcome of `PuzzleSession.checkAgainstSolution` (#52 follow-up):
 * - "clean" — no mistakes found.
 * - "mistake-value" — a placed value doesn't match the solution. Reported
 *   without saying where yet (first press since the board last changed —
 *   "are you on the right track" rather than "here's exactly what's
 *   wrong"). Takes precedence over "mistake-notes" when both are present:
 *   a wrong digit is the more actionable problem.
 * - "mistake-notes" — no wrong placed value, but a centre note has
 *   eliminated the correct digit somewhere. Same first-press, not-yet-
 *   located reporting as "mistake-value".
 * - "revealed" — a second consecutive press (no edit in between) found the
 *   same mistake(s) again, so this time they're actually highlighted via
 *   `incorrectCells`/`flaggedCells`.
 */
export type CheckOutcome = "clean" | "mistake-value" | "mistake-notes" | "revealed";

export class PuzzleSession {
    readonly puzzle: CompiledPuzzle;
    readonly geometry: Geometry;
    inputMode: InputMode = "digit";
    /** Opt-in: when leaving a cell, flag it if its remaining centre notes no longer include the solution digit. */
    checkNotesOnLeave = false;

    private board = new Map<CellId, CellState>();
    /** The pen layer (#45): the player's lines and X/O marks, outside the puzzle and its evaluation. */
    private pen: PenState = EMPTY_PEN;
    private past: HistoryEntry[] = [];
    private futureStack: HistoryEntry[] = [];
    private selection = new Set<CellId>();
    private cursor: CellId | null = null;
    private flaggedCells = new Set<CellId>();
    /** Cells flagged by `checkAgainstSolution` as holding a placed value that doesn't match the solution. */
    private incorrectCells = new Set<CellId>();
    /** True once `checkAgainstSolution` has found a mistake but not yet revealed it — disarmed by any board edit. */
    private checkArmed = false;
    private readonly listeners = new Set<() => void>();
    private cachedEvaluation: EvaluationResult | null = null;
    /** Cells whose value changed since `cachedEvaluation` was last computed. */
    private dirtyCells = new Set<CellId>();
    private revisionCount = 0;

    constructor(puzzle: CompiledPuzzle, options: SessionOptions = {}) {
        this.puzzle = puzzle;
        this.geometry = createGeometry(puzzle.geometry);
        this.cursor = this.geometry.cells[0] ?? null;
        if (options.onChange) this.listeners.add(options.onChange);
        if (options.initialProgress) this.applyProgress(options.initialProgress);
        if (options.initialPen) this.pen = sanitizePen(options.initialPen);
        if (options.checkNotesOnLeave !== undefined) this.checkNotesOnLeave = options.checkNotesOnLeave;
    }

    // --- subscription -----------------------------------------------------

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    private emit(): void {
        this.revisionCount++;
        for (const listener of this.listeners) listener();
    }

    /** Marks cells as needing re-evaluation; evaluated lazily, incrementally, next read. */
    private markDirty(cells: Iterable<CellId>): void {
        for (const cell of cells) this.dirtyCells.add(cell);
    }

    /** Forces a full re-evaluation on the next read — for edits too wholesale to diff cheaply. */
    private invalidateEvaluation(): void {
        this.cachedEvaluation = null;
        this.dirtyCells.clear();
    }

    /** Monotonic change counter — a stable snapshot for `useSyncExternalStore`. */
    get revision(): number {
        return this.revisionCount;
    }

    // --- reads ------------------------------------------------------------

    isGiven(cell: CellId): boolean {
        return cell in this.puzzle.givens;
    }

    cellState(cell: CellId): CellState {
        const given = this.puzzle.givens[cell];
        if (given !== undefined) {
            return { value: given, notes: [], centerNotes: [], colors: this.board.get(cell)?.colors ?? [] };
        }
        return this.board.get(cell) ?? EMPTY_CELL;
    }

    /**
     * What to actually show the player for `cell` — as opposed to
     * `cellState`/`valueOf`, which always give a given priority since that's
     * what a given *is* for evaluation/fog-reveal purposes. While a given is
     * still hidden by fog, though, the player can't tell it apart from a
     * hidden empty cell, so it must behave like one on screen: show (and
     * accept) their own guess instead, deferring to the real given only once
     * it's revealed.
     */
    displayState(cell: CellId): CellState {
        if (this.isGiven(cell) && this.getHiddenCells().has(cell)) {
            return this.board.get(cell) ?? EMPTY_CELL;
        }
        return this.cellState(cell);
    }

    valueOf = (cell: CellId): number | null => {
        const given = this.puzzle.givens[cell];
        if (given !== undefined) return given;
        return this.board.get(cell)?.value ?? null;
    };

    getSelection(): ReadonlySet<CellId> {
        // A copy, not the live Set: `select(cell, "add")` mutates `this.selection`
        // in place, so handing out the same reference on every call would make a
        // consumer's React state setter (Object.is-equal to its previous value)
        // silently skip re-rendering mid-drag even though membership changed.
        return new Set(this.selection);
    }

    getCursor(): CellId | null {
        return this.cursor;
    }

    /** Cells whose remaining centre notes exclude the solution digit — set by `checkNotesOnLeave` and/or `checkAgainstSolution`. */
    getFlaggedCells(): ReadonlySet<CellId> {
        return this.flaggedCells;
    }

    /** Cells flagged by `checkAgainstSolution` as holding a value that doesn't match the solution. */
    getIncorrectCells(): ReadonlySet<CellId> {
        return this.incorrectCells;
    }

    /** Cells still hidden by fog (see `runtime/fog.ts`) — empty for puzzles without `fog`. */
    getHiddenCells(): ReadonlySet<CellId> {
        return hiddenCells(this.puzzle, this.valueOf);
    }

    get evaluation(): EvaluationResult {
        if (!this.cachedEvaluation) {
            this.cachedEvaluation = evaluate(this.puzzle, this.valueOf);
        } else if (this.dirtyCells.size > 0) {
            this.cachedEvaluation = evaluateIncremental(
                this.puzzle,
                this.valueOf,
                this.cachedEvaluation,
                this.dirtyCells,
            );
        }
        this.dirtyCells.clear();
        return this.cachedEvaluation;
    }

    get canUndo(): boolean {
        return this.past.length > 0;
    }

    get canRedo(): boolean {
        return this.futureStack.length > 0;
    }

    // --- selection -------------------------------------------------------

    select(cell: CellId, mode: SelectMode = "replace"): void {
        if (!this.geometry.has(cell)) return;
        this.leaveCursorCell(cell);
        if (mode === "replace") {
            this.selection = new Set([cell]);
        } else if (mode === "add") {
            this.selection.add(cell);
        } else {
            if (this.selection.has(cell)) this.selection.delete(cell);
            else this.selection.add(cell);
        }
        this.cursor = cell;
        this.emit();
    }

    /** Clears the selection *and* the cursor ring — nothing stays highlighted. */
    selectNone(): void {
        this.leaveCursorCell(null);
        this.selection.clear();
        this.cursor = null;
        this.emit();
    }

    moveCursor(dir: Direction, extend = false): void {
        if (!this.cursor) {
            // No cursor (e.g. right after selectNone()) — an arrow key just
            // re-anchors on the first cell rather than stepping from nowhere.
            const first = this.geometry.cells[0];
            if (!first) return;
            this.cursor = first;
            this.selection = new Set([first]);
            this.emit();
            return;
        }
        const next = this.geometry.step(this.cursor, dir);
        if (!next) return;
        this.leaveCursorCell(next);
        this.cursor = next;
        if (extend) this.selection.add(next);
        else this.selection = new Set([next]);
        this.emit();
    }

    /** Selects every cell sharing the cursor cell's value. No-op on an empty cell. */
    selectSameValue(): void {
        if (!this.cursor) return;
        const value = this.valueOf(this.cursor);
        if (value === null) return;
        this.selection = new Set(this.geometry.cells.filter((c) => this.valueOf(c) === value));
        this.emit();
    }

    /**
     * Moves the cursor to the next (or, with `direction` -1, previous) empty cell. Wraps around
     * unless `wrap` is false, in which case it stops at the ends. Returns whether it moved.
     */
    jumpToEmptyCell(direction: 1 | -1, wrap = true): boolean {
        const cells = this.geometry.cells;
        if (cells.length === 0) return false;
        const startIndex = this.cursor ? cells.indexOf(this.cursor) : -1;

        for (let step = 1; step <= cells.length; step++) {
            const raw = startIndex + direction * step;
            if (!wrap && (raw < 0 || raw >= cells.length)) return false;
            const index = ((raw % cells.length) + cells.length) % cells.length;
            const cell = cells[index];
            if (this.valueOf(cell) === null) {
                this.leaveCursorCell(cell);
                this.cursor = cell;
                this.selection = new Set([cell]);
                this.emit();
                return true;
            }
        }
        return false;
    }

    /**
     * True if `state`'s remaining centre notes used to include `answer` but
     * no longer do — a bad elimination. Corner notes aren't checked: as
     * conventionally used, a centre note asserts "this cell *is* one of
     * these digits" (so excluding the answer is a genuine mistake), while a
     * corner note is more like "this digit goes in here-or-here" scratch
     * work across several cells — it isn't a per-cell candidate list, so
     * judging it against this cell's solution digit doesn't mean anything.
     */
    private notesExcludeAnswer(state: CellState, answer: number): boolean {
        return state.centerNotes.length > 0 && !state.centerNotes.includes(answer);
    }

    /**
     * Re-checks `cell` (the cell the cursor is about to leave, if any) against
     * `checkNotesOnLeave`, flagging it if its remaining notes no longer include
     * the declared solution digit — i.e. the player eliminated the right answer.
     * A no-op if the cell is a given/filled, has no solution on record, or has
     * no notes at all (nothing was eliminated).
     */
    private leaveCursorCell(nextCursor: CellId | null): void {
        if (!this.checkNotesOnLeave || !this.cursor || this.cursor === nextCursor) return;
        const cell = this.cursor;

        const answer = this.puzzle.solution?.[cell];
        const state = this.board.get(cell);
        if (answer === undefined || !state || state.value !== null) {
            this.flaggedCells.delete(cell);
            return;
        }

        if (this.notesExcludeAnswer(state, answer)) this.flaggedCells.add(cell);
        else this.flaggedCells.delete(cell);
    }

    /**
     * Manual "check" (SudokuPad's 'V'): a one-shot, on-demand sweep of the
     * whole board against the known solution — deliberately not live/
     * continuous, so the puzzle doesn't turn into trial-and-error (#52). A
     * no-op if the puzzle has no declared solution.
     *
     * Two-stage on purpose: usually the player just wants to know if they're
     * on the right track, not have every mistake immediately pointed out
     * (that tips into trial-and-error territory just as much as a live
     * checker would). So the first press only reports "mistake" — nothing
     * is highlighted. Only a second, consecutive press (no edit in between)
     * actually reveals which cells via `incorrectCells` (a placed value that
     * doesn't match the solution — "legal so far, but wrong") and
     * `flaggedCells` (remaining notes that have eliminated the correct
     * digit — reusing the exact same check `checkNotesOnLeave` does
     * per-cell, just run across every cell at once).
     */
    checkAgainstSolution(): CheckOutcome {
        const solution = this.puzzle.solution;
        if (!solution) return "clean";

        const incorrect = new Set<CellId>();
        const flagged = new Set<CellId>();
        for (const cell of this.geometry.cells) {
            if (this.isGiven(cell)) continue;
            const answer = solution[cell];
            if (answer === undefined) continue;
            const state = this.board.get(cell);
            if (!state) continue;

            if (state.value !== null) {
                if (state.value !== answer) incorrect.add(cell);
            } else if (this.notesExcludeAnswer(state, answer)) {
                flagged.add(cell);
            }
        }
        const clean = incorrect.size === 0 && flagged.size === 0;

        let outcome: CheckOutcome;
        if (clean) {
            outcome = "clean";
            this.checkArmed = false;
        } else if (this.checkArmed) {
            outcome = "revealed";
            this.checkArmed = false;
        } else {
            // A wrong placed value is the more actionable problem, so it wins
            // over a note-elimination mistake when both are present.
            outcome = incorrect.size > 0 ? "mistake-value" : "mistake-notes";
            this.checkArmed = true;
        }

        if (outcome === "revealed" || outcome === "clean") {
            this.incorrectCells = incorrect;
            this.flaggedCells = flagged;
        } else {
            this.incorrectCells.clear();
            this.flaggedCells.clear();
        }
        this.emit();
        return outcome;
    }

    // --- mutation -------------------------------------------------------

    setInputMode(mode: InputMode): void {
        this.inputMode = mode;
        this.emit();
    }

    getPen(): PenState {
        return this.pen;
    }

    /** Draws one pen stroke along the given lattice points (#45); one undo step. */
    penStroke(points: readonly PenPoint[]): void {
        this.setPen(applyStroke(this.pen, points));
    }

    /** A click at a lattice point (#45): cycles nothing -> X -> O -> nothing there; one undo step. */
    penMark(point: PenPoint): void {
        this.setPen(cycleMark(this.pen, point));
    }

    clearPen(): void {
        this.setPen(EMPTY_PEN);
    }

    /** The pen layer as plain data, for storage. */
    toPen(): PenState {
        return this.pen;
    }

    private setPen(next: PenState): void {
        if (next === this.pen) return;
        this.pushEntry({ kind: "pen", pen: this.pen });
        this.pen = next;
        this.emit();
    }

    setCheckNotesOnLeave(on: boolean): void {
        this.checkNotesOnLeave = on;
        if (!on) this.flaggedCells.clear();
        this.emit();
    }

    private targets(): CellId[] {
        const cells = this.selection.size > 0 ? [...this.selection] : this.cursor ? [this.cursor] : [];
        // A given is normally immutable, but while it's still hidden by fog
        // the player has no way to tell it apart from a hidden empty cell —
        // so it stays editable, same as one, until it's revealed.
        const hidden = this.getHiddenCells();
        return cells.filter((c) => !this.isGiven(c) || hidden.has(c));
    }

    /** Applies a plain digit press according to the active `inputMode`. */
    input(digit: number): void {
        if (this.inputMode === "pen") return; // the pen draws on the board; digits do nothing
        if (this.inputMode === "corner") return this.toggleCornerNote(digit);
        if (this.inputMode === "center") return this.toggleCenterNote(digit);
        if (this.inputMode === "color") {
            const index = markIndexForDigit(digit);
            if (index !== undefined) this.toggleColor(index);
            return;
        }

        const cells = this.targets();
        if (cells.length === 0) return;
        if (!this.puzzle.domain.includes(digit)) return;

        this.pushPatch(cells);
        this.checkArmed = false;
        for (const cell of cells) {
            this.board.set(cell, { ...(this.board.get(cell) ?? EMPTY_CELL), value: digit, notes: [], centerNotes: [] });
            this.incorrectCells.delete(cell);
        }
        this.markDirty(cells);
        this.emit();
    }

    /**
     * Corrects a value that's still being typed, without pushing a new undo
     * step — for multi-digit domains (#large-domain follow-up), where the
     * first keystroke of a number is entered live via `input()` (so there's
     * instant feedback instead of a wait for the whole number to resolve) and
     * a second keystroke then needs to fix it up to the full value. One
     * logical "type a value" action should be one undo step, not one per
     * keystroke.
     */
    replaceValue(digit: number): void {
        if (this.inputMode !== "digit") return;
        const cells = this.targets();
        if (cells.length === 0) return;
        if (!this.puzzle.domain.includes(digit)) return;

        this.checkArmed = false;
        for (const cell of cells) {
            this.board.set(cell, { ...(this.board.get(cell) ?? EMPTY_CELL), value: digit, notes: [], centerNotes: [] });
            this.incorrectCells.delete(cell);
        }
        this.markDirty(cells);
        this.emit();
    }

    /** Toggles a corner note directly, independent of `inputMode`. */
    toggleCornerNote(digit: number): void {
        this.toggleNote(digit, "notes");
    }

    /** Toggles a centre (candidate) note directly, independent of `inputMode`. */
    toggleCenterNote(digit: number): void {
        this.toggleNote(digit, "centerNotes");
    }

    /**
     * Toggles palette colour `index` on the selection (#35). Unlike digits and
     * notes it applies to givens too — marking a clue is half the point — and
     * leaves the cell's value and notes alone. If every target already has the
     * colour it's removed from all of them; otherwise it's added to the rest, so
     * one press on a mixed selection paints the whole selection.
     */
    toggleColor(index: number): void {
        if (!Number.isInteger(index) || index < 0 || index >= MARK_COLOR_COUNT) return;
        const cells = this.selection.size > 0 ? [...this.selection] : this.cursor ? [this.cursor] : [];
        if (cells.length === 0) return;

        const has = (c: CellId) => (this.board.get(c)?.colors ?? []).includes(index);
        const remove = cells.every(has);

        this.pushPatch(cells);
        for (const cell of cells) {
            const current = this.board.get(cell) ?? EMPTY_CELL;
            const colors = remove
                ? current.colors.filter((c) => c !== index)
                : [...new Set([...current.colors, index])].sort((a, b) => a - b);
            this.setOrDrop(cell, { ...current, colors });
        }
        this.emit();
    }

    /** Stores `state`, or drops the cell's entry entirely once nothing is left on it. */
    private setOrDrop(cell: CellId, state: CellState): void {
        if (
            state.value === null &&
            state.notes.length === 0 &&
            state.centerNotes.length === 0 &&
            state.colors.length === 0
        ) {
            this.board.delete(cell);
        } else {
            this.board.set(cell, state);
        }
    }

    private toggleNote(digit: number, field: "notes" | "centerNotes"): void {
        const cells = this.targets();
        if (cells.length === 0) return;
        if (!this.puzzle.domain.includes(digit)) return;

        this.pushPatch(cells);
        this.checkArmed = false;
        for (const cell of cells) {
            const current = this.board.get(cell) ?? EMPTY_CELL;
            if (current.value !== null) continue;
            this.board.set(cell, { ...current, [field]: toggleSet(current[field], digit) });
        }
        this.emit();
    }

    /** Clears only the layer matching the active `inputMode` (value / corner / center / colour). */
    erase(): void {
        if (this.inputMode === "pen") return this.clearPen();
        if (this.inputMode === "color") return this.eraseColors();
        const cells = this.targets();
        if (cells.length === 0) return;

        const field: "value" | "notes" | "centerNotes" =
            this.inputMode === "corner" ? "notes" : this.inputMode === "center" ? "centerNotes" : "value";

        const hasContent = cells.some((c) => {
            const s = this.board.get(c);
            if (!s) return false;
            return field === "value" ? s.value !== null : s[field].length > 0;
        });
        if (!hasContent) return;

        this.pushPatch(cells);
        this.checkArmed = false;
        for (const cell of cells) {
            const current = this.board.get(cell);
            if (!current) continue;
            this.setOrDrop(cell, field === "value" ? { ...current, value: null } : { ...current, [field]: [] });
            if (field === "value") this.incorrectCells.delete(cell);
        }
        if (field === "value") this.markDirty(cells);
        this.emit();
    }

    private eraseColors(): void {
        const cells = this.selection.size > 0 ? [...this.selection] : this.cursor ? [this.cursor] : [];
        if (!cells.some((c) => (this.board.get(c)?.colors.length ?? 0) > 0)) return;
        this.pushPatch(cells);
        for (const cell of cells) {
            const current = this.board.get(cell);
            if (current) this.setOrDrop(cell, { ...current, colors: [] });
        }
        this.emit();
    }

    undo(): void {
        const entry = this.past.pop();
        if (!entry) return;
        this.futureStack.push(this.applyEntry(entry));
        this.flaggedCells.clear();
        this.incorrectCells.clear();
        this.checkArmed = false;
        this.emit();
    }

    redo(): void {
        const entry = this.futureStack.pop();
        if (!entry) return;
        this.past.push(this.applyEntry(entry));
        this.flaggedCells.clear();
        this.incorrectCells.clear();
        this.checkArmed = false;
        this.emit();
    }

    reset(): void {
        if (this.board.size === 0 && isPenEmpty(this.pen)) return;
        this.pushFullSnapshot();
        this.board.clear();
        this.pen = EMPTY_PEN;
        this.flaggedCells.clear();
        this.incorrectCells.clear();
        this.checkArmed = false;
        this.invalidateEvaluation();
        this.emit();
    }

    // --- persistence ---------------------------------------------------

    toProgress(): ProgressSnapshot {
        const out: Record<CellId, ProgressSnapshot[CellId]> = {};
        for (const [cell, state] of this.board) {
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
    }

    loadProgress(snapshot: ProgressSnapshot): void {
        this.pushFullSnapshot();
        this.applyProgress(snapshot);
        this.flaggedCells.clear();
        this.incorrectCells.clear();
        this.checkArmed = false;
        this.invalidateEvaluation();
        this.emit();
    }

    private applyProgress(snapshot: ProgressSnapshot): void {
        this.board.clear();
        const setEntry = (cell: CellId, entry: ProgressSnapshot[CellId]): void => {
            const colors = [
                ...new Set((entry.colors ?? []).filter((c) => Number.isInteger(c) && c >= 0 && c < MARK_COLOR_COUNT)),
            ].sort((a, b) => a - b);
            if (entry.value !== undefined && this.puzzle.domain.includes(entry.value)) {
                this.board.set(cell, { value: entry.value, notes: [], centerNotes: [], colors });
                return;
            }
            const notes = entry.notes ? [...entry.notes].sort((a, b) => a - b) : [];
            const centerNotes = entry.centerNotes ? [...entry.centerNotes].sort((a, b) => a - b) : [];
            if (notes.length > 0 || centerNotes.length > 0 || colors.length > 0) {
                this.board.set(cell, { value: null, notes, centerNotes, colors });
            }
        };

        const entries = Object.entries(snapshot).filter(([cell]) => this.geometry.has(cell));
        for (const [cell, entry] of entries) {
            if (!this.isGiven(cell)) setEntry(cell, entry);
            // A visible given keeps only its colour marks (its value is the clue itself).
            else setEntry(cell, { colors: entry.colors });
        }
        // A given's own saved guess only matters if it was still hidden by
        // fog when saved — restore it the same way `targets()` lets it be
        // entered in the first place. Computed after the pass above since
        // the reveal rule only looks at the real board/given values, never
        // at a given cell's own (not-yet-restored) entry anyway.
        const hidden = hiddenCells(this.puzzle, this.valueOf);
        for (const [cell, entry] of entries) {
            if (this.isGiven(cell) && hidden.has(cell)) setEntry(cell, entry);
        }
    }

    // --- history internals -------------------------------------------

    /** Records just the given cells' *current* (pre-edit) state as the undo step. */
    private pushPatch(cells: readonly CellId[]): void {
        const patch = new Map<CellId, CellState | undefined>();
        for (const cell of cells) patch.set(cell, this.board.get(cell));
        this.pushEntry({ kind: "patch", patch });
    }

    private pushFullSnapshot(): void {
        this.pushEntry({ kind: "full", snapshot: this.serializeBoard() });
    }

    private pushEntry(entry: HistoryEntry): void {
        this.past.push(entry);
        if (this.past.length > 200) this.past.shift();
        this.futureStack = [];
    }

    /**
     * Applies a history entry (either direction — undo and redo are the same
     * operation on opposite stacks) and returns its inverse, to push onto the
     * other stack. A `patch` only dirties the cells it actually touched, so
     * undo/redo gets the same cheap incremental re-evaluation as a normal
     * edit; a `full` snapshot can't know what changed without a full board
     * diff, so it falls back to invalidating everything, same as before.
     */
    private applyEntry(entry: HistoryEntry): HistoryEntry {
        if (entry.kind === "pen") {
            const inverse: HistoryEntry = { kind: "pen", pen: this.pen };
            this.pen = entry.pen;
            return inverse;
        }
        if (entry.kind === "full") {
            const inverse: HistoryEntry = { kind: "full", snapshot: this.serializeBoard() };
            this.restoreBoard(entry.snapshot);
            this.invalidateEvaluation();
            return inverse;
        }

        const inverse = new Map<CellId, CellState | undefined>();
        for (const [cell, state] of entry.patch) {
            inverse.set(cell, this.board.get(cell));
            if (state === undefined) this.board.delete(cell);
            else this.board.set(cell, state);
        }
        this.markDirty(entry.patch.keys());
        return { kind: "patch", patch: inverse };
    }

    private serializeBoard(): string {
        return JSON.stringify({ board: [...this.board.entries()], pen: this.pen });
    }

    private restoreBoard(serialized: string): void {
        const { board, pen } = JSON.parse(serialized) as { board: [CellId, CellState][]; pen: PenState };
        this.board = new Map(board);
        this.pen = pen;
    }
}

export const penStorageKey = (puzzleId: string): string => `cpr:pen:${puzzleId}`;

export const progressStorageKey = (puzzleId: string): string => `cpr:progress:${puzzleId}`;

/** Local, per-puzzle solve-timer stats (#68) — distinct from community
 *  leaderboards (#58, needs accounts+backend). Just "how long did that take,
 *  on this device". */
export interface PuzzleStats {
    /** The current attempt's accumulated active solving time, ms. */
    elapsedMs: number;
    /** The fastest *completed* solve recorded for this puzzle, ms — kept
     *  across resets/retries, only ever lowered. */
    bestElapsedMs?: number;
}

export const statsStorageKey = (puzzleId: string): string => `cpr:stats:${puzzleId}`;

export { lookupFromRecord };
