/**
 * PuzzleSession: interactive state on top of a compiled puzzle.
 *
 * This class is generic on purpose. It uses cell ids and a value domain.
 * It never uses "9x9" or "digits 1-9".
 * It is a plain class that owns mutable state and tells subscribers about changes.
 * Thus a React hook can connect to it with `useSyncExternalStore`.
 *
 * Responsibilities: selection and keyboard cursor, value and pencil-mark entry,
 * undo and redo, memoised constraint evaluation, and progress snapshots for storage.
 */

import type { CellId, Direction, Geometry } from "@/runtime/geometry.ts";
import { createGeometry } from "@/runtime/geometry.ts";
import type { CompiledPuzzle, VisualObject } from "@/runtime/puzzle.ts";
import {
    evaluate,
    evaluateIncremental,
    lookupFromRecord,
    ruledOutNotes,
    type EvaluationResult,
} from "@/runtime/evaluate.ts";
import { hiddenCells } from "@/runtime/fog.ts";
import { ruleAbsentCells, visibleObjects } from "@/runtime/rules.ts";
import { MARK_COLOR_COUNT, markIndexForDigit } from "@/runtime/mark_colors.ts";
import { UndoStack } from "@/runtime/undo_stack.ts";
import { EMPTY_CELL, boardToProgress, progressEntryToState, toggleSet } from "@/runtime/cell_state.ts";
import type {
    CellState,
    CheckOutcome,
    InputMode,
    ProgressSnapshot,
    SelectMode,
    SessionOptions,
} from "@/runtime/session_types.ts";
import {
    EMPTY_PEN,
    cycleMark,
    applyStroke,
    erasePenInCells,
    isPenEmpty,
    sanitizePen,
    type PenPoint,
    type PenState,
} from "@/runtime/pen.ts";

export type * from "@/runtime/session_types.ts";
export { penStorageKey, progressStorageKey, statsStorageKey } from "@/runtime/session_types.ts";

/**
 * One undo/redo step. Single-cell edits (typing, notes, erase) are frequent, so they are a `patch`:
 * the prior state of the changed cells only, not the whole board.
 * `undefined` means the cell had no entry. Restore it by deleting the entry, not by setting an empty
 * `CellState` (the same cleanup as in `erase()`).
 * `reset` and `loadProgress` replace the whole board. They are rare and already O(board size),
 * so a `full` snapshot is the simplest.
 */
type HistoryEntry =
    | { kind: "patch"; patch: ReadonlyMap<CellId, CellState | undefined> }
    | { kind: "pen"; pen: PenState }
    | { kind: "full"; snapshot: string };

/** A layer of a cell that Erase can clear. */
type EraseLayer = "value" | "centerNotes" | "notes" | "colors" | "pen";
/** The order in which Erase goes down the layers, after the layer of the active mode. The pen layer is the last link. */
const ERASE_CHAIN: readonly EraseLayer[] = ["value", "centerNotes", "notes", "colors", "pen"];

export class PuzzleSession {
    readonly puzzle: CompiledPuzzle;
    readonly geometry: Geometry;
    inputMode: InputMode = "digit";
    /** Opt-in: when the cursor leaves a cell, flag the cell if its centre notes do not include the solution digit. */
    checkNotesOnLeave = false;

    private board = new Map<CellId, CellState>();
    /** The pen layer: the lines and X/O marks of the player. It is outside the puzzle and its evaluation. */
    private pen: PenState = EMPTY_PEN;
    private history = new UndoStack<HistoryEntry>();
    private selection = new Set<CellId>();
    private cursor: CellId | null = null;
    /** The cell whose digit the player asked to see everywhere (double-click). Moving the cursor off it clears the highlight. */
    private matchCell: CellId | null = null;
    private flaggedCells = new Set<CellId>();
    /** Cells flagged by `checkAgainstSolution` as holding a placed value that does not match the solution. */
    private incorrectCells = new Set<CellId>();
    /** True when `checkAgainstSolution` found a mistake but did not reveal it yet. Any board edit disarms it. */
    private checkArmed = false;
    private readonly listeners = new Set<() => void>();
    private cachedEvaluation: EvaluationResult | null = null;
    /** Cells whose value changed since the last computation of `cachedEvaluation`. */
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

    /** Marks cells as needing re-evaluation. The next read evaluates them, lazily and incrementally. */
    private markDirty(cells: Iterable<CellId>): void {
        for (const cell of cells) this.dirtyCells.add(cell);
    }

    /** Forces a full re-evaluation on the next read. Use it for edits that are too large to diff cheaply. */
    private invalidateEvaluation(): void {
        this.cachedEvaluation = null;
        this.dirtyCells.clear();
    }

    /** Change counter that only increases. It gives a stable snapshot for `useSyncExternalStore`. */
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
     * What to show the player for `cell`.
     * `cellState` and `valueOf` are different: they always give priority to a given,
     * because that is what a given *is* for evaluation and fog reveal.
     * While fog hides a given, the player cannot tell it from a hidden empty cell.
     * So it must behave like an empty cell on screen.
     * Show (and accept) the guess of the player.
     * Use the real given only after it is revealed.
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
        // Return a copy, not the live Set. `select(cell, "add")` changes `this.selection` in place.
        // If every call returned the same reference, the React state setter of a consumer
        // would see an Object.is-equal value. It would skip the render during a drag,
        // although the members changed.
        return new Set(this.selection);
    }

    getCursor(): CellId | null {
        return this.cursor;
    }

    /** Whether the player asked to highlight every cell that has the cursor cell's digit. */
    isMatchHighlighted(): boolean {
        return this.matchCell !== null && this.matchCell === this.cursor;
    }

    /** Asks to highlight every cell that has the cursor cell's digit, until the cursor moves. It does nothing on an empty cell. */
    highlightMatches(): void {
        if (!this.cursor || this.valueOf(this.cursor) === null) return;
        this.matchCell = this.cursor;
        this.emit();
    }

    /**
     * The note digits (corner and centre) that a placed digit already rules out, for each cell.
     * It uses the constraints of the puzzle, not only the rows, columns and boxes.
     */
    getRuledOutNotes(): ReadonlyMap<CellId, ReadonlySet<number>> {
        const hidden = this.getHiddenCells();
        const noted = new Map<CellId, number[]>();
        for (const [cell, state] of this.board) {
            if (state.value !== null || hidden.has(cell)) continue;
            const digits = [...new Set([...state.notes, ...state.centerNotes])];
            if (digits.length > 0) noted.set(cell, digits);
        }
        return ruledOutNotes(this.puzzle, this.valueOf, noted);
    }

    /** Cells whose centre notes exclude the solution digit. `checkNotesOnLeave` or `checkAgainstSolution` sets them. */
    getFlaggedCells(): ReadonlySet<CellId> {
        return this.flaggedCells;
    }

    /** Cells flagged by `checkAgainstSolution` as holding a value that does not match the solution. */
    getIncorrectCells(): ReadonlySet<CellId> {
        return this.incorrectCells;
    }

    /** Cells that fog still hides (see `runtime/fog.ts`). Empty for puzzles without `fog`. */
    getHiddenCells(): ReadonlySet<CellId> {
        return hiddenCells(this.puzzle, this.valueOf);
    }

    /** Cells that no dynamic rule has made `appear` yet. They are not drawn and not selectable. */
    getAbsentCells(): ReadonlySet<CellId> {
        return ruleAbsentCells(this.puzzle, this.valueOf);
    }

    /** The visual objects to draw now. Dynamic rules can show or hide some of them. */
    getVisibleObjects(): readonly VisualObject[] {
        return visibleObjects(this.puzzle, this.valueOf);
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
        return this.history.canUndo;
    }

    get canRedo(): boolean {
        return this.history.canRedo;
    }

    // --- selection -------------------------------------------------------

    select(cell: CellId, mode: SelectMode = "replace"): void {
        if (!this.geometry.has(cell) || this.getAbsentCells().has(cell)) return;
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

    /** Clears the selection *and* the cursor ring. Nothing stays highlighted. */
    selectNone(): void {
        this.leaveCursorCell(null);
        this.selection.clear();
        this.cursor = null;
        this.emit();
    }

    moveCursor(dir: Direction, extend = false): void {
        if (!this.cursor) {
            // There is no cursor (for example, right after selectNone()).
            // An arrow key puts the cursor on the first cell. It does not step from nowhere.
            const first = this.geometry.cells[0];
            if (!first) return;
            this.cursor = first;
            this.selection = new Set([first]);
            this.emit();
            return;
        }
        // The cursor steps over cells that are not on the board yet, like a gap between grids.
        const absent = this.getAbsentCells();
        let next = this.geometry.step(this.cursor, dir);
        while (next && absent.has(next)) next = this.geometry.step(next, dir);
        if (!next) return;
        this.leaveCursorCell(next);
        this.cursor = next;
        if (extend) this.selection.add(next);
        else this.selection = new Set([next]);
        this.emit();
    }

    /** Selects all cells that have the same value as the cursor cell. It does nothing on an empty cell. */
    selectSameValue(): void {
        if (!this.cursor) return;
        const value = this.valueOf(this.cursor);
        if (value === null) return;
        const absent = this.getAbsentCells();
        this.selection = new Set(this.geometry.cells.filter((c) => !absent.has(c) && this.valueOf(c) === value));
        this.emit();
    }

    /**
     * Moves the cursor to the next empty cell (with `direction` -1, the previous empty cell).
     * It wraps around, unless `wrap` is false. Then it stops at the ends.
     * Returns whether it moved.
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
            if (this.valueOf(cell) === null && !this.getAbsentCells().has(cell)) {
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
     * True if the centre notes of `state` do not include `answer` (a bad elimination).
     * Only centre notes count. By convention a centre note says that this cell *is* one of these digits,
     * so one that excludes the answer is a mistake. A corner note is scratch work across several cells
     * ("this digit goes here or here"), not a candidate list for one cell.
     */
    private notesExcludeAnswer(state: CellState, answer: number): boolean {
        return state.centerNotes.length > 0 && !state.centerNotes.includes(answer);
    }

    /**
     * Checks `cell` again against `checkNotesOnLeave`. `cell` is the cell that the cursor is about to leave, if any.
     * It flags the cell if its notes do not include the declared solution digit.
     * This means that the player removed the right answer.
     * It does nothing if the cell is a given or has a value, has no solution on record,
     * or has no notes (nothing was removed).
     */
    private leaveCursorCell(nextCursor: CellId | null): void {
        if (this.cursor !== nextCursor) this.matchCell = null;
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
     * Manual "check" (the 'V' key of SudokuPad) of the whole board against the known solution, on request.
     * It is not live on purpose: a live check, or one that shows every mistake at once, turns the puzzle into
     * trial and error. So the first press only reports "mistake" and highlights nothing.
     * A second press in a row (no edit between) shows the cells: `incorrectCells` for a placed value that is legal
     * so far but wrong, `flaggedCells` for notes that removed the correct digit
     * (the check that `checkNotesOnLeave` does for one cell, run on all cells).
     * It does nothing if the puzzle has no declared solution.
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
            // A wrong placed value is the more useful problem to show.
            // It has priority over a note-elimination mistake when both are present.
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

    /** Draws one pen stroke along the given lattice points. It is one undo step. */
    penStroke(points: readonly PenPoint[]): void {
        this.setPen(applyStroke(this.pen, points));
    }

    /** A click at a lattice point. The mark there cycles nothing -> X -> O -> nothing. It is one undo step. */
    penMark(point: PenPoint): void {
        this.setPen(cycleMark(this.pen, point));
    }

    clearPen(): void {
        this.setPen(EMPTY_PEN);
    }

    /** The pen layer as plain data for storage. */
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
        const absent = this.getAbsentCells();
        const cells = (this.selection.size > 0 ? [...this.selection] : this.cursor ? [this.cursor] : []).filter(
            (c) => !absent.has(c),
        );
        // A given is normally immutable.
        // But while fog hides it, the player cannot tell it from a hidden empty cell.
        // So it stays editable, like an empty cell, until it is revealed.
        const hidden = this.getHiddenCells();
        return cells.filter((c) => !this.isGiven(c) || hidden.has(c));
    }

    /** Applies a plain digit press as the active `inputMode` requires. */
    input(digit: number): void {
        if (this.inputMode === "pen") return; // the pen draws on the board. Digits do nothing.
        if (this.inputMode === "corner") return this.toggleCornerNote(digit);
        if (this.inputMode === "center") return this.toggleCenterNote(digit);
        if (this.inputMode === "color") {
            // Colour k is the k-th key of the pad. A puzzle with fewer digits has fewer colours (see the number pad).
            const colorCount = this.puzzle.domain.filter((v) => v !== 0).length;
            const index = digit > colorCount ? undefined : markIndexForDigit(digit);
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
     * Corrects a value that the player is still typing. It does not push a new undo step.
     * It is for multi-digit domains (#large-domain follow-up).
     * There, `input()` enters the first keystroke of a number at once, so the player gets instant feedback.
     * The player does not wait for the whole number.
     * A second keystroke then changes it to the full value.
     * One logical "type a value" action must be one undo step, not one for each keystroke.
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

    /** Toggles a corner note directly. `inputMode` has no effect. */
    toggleCornerNote(digit: number): void {
        this.toggleNote(digit, "notes");
    }

    /** Toggles a centre (candidate) note directly. `inputMode` has no effect. */
    toggleCenterNote(digit: number): void {
        this.toggleNote(digit, "centerNotes");
    }

    /**
     * Toggles palette colour `index` on the selection.
     * Unlike digits and notes, it applies to givens too. To mark a clue is a main use of colours.
     * It does not change the value and notes of the cell.
     * If all targets have the colour, it removes the colour from all of them.
     * Otherwise, it adds the colour to the other targets.
     * Thus one press on a mixed selection paints the whole selection.
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

    /** Stores `state`. If the cell has nothing left, it deletes the entry of the cell. */
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

    /**
     * Peels one layer off the selected cells. It starts with the layer of the active `inputMode`
     * (value / corner / center / colour). If the selected cells have nothing there, it goes on down
     * the chain: value, centre notes, corner notes, colours, and last the pen. So repeated presses clear a cell
     * fully, and each press is one undo step. The pen goes only where it lies on the selected cells (see
     * `erasePenInCells`). In Pen mode, Erase still clears the whole pen layer, as the "Clear pen" button says. A selection of several cells peels the first layer that any
     * of them has, from all of them at once.
     */
    erase(): void {
        if (this.inputMode === "pen") return this.clearPen();
        const first: EraseLayer =
            this.inputMode === "corner"
                ? "notes"
                : this.inputMode === "center"
                  ? "centerNotes"
                  : this.inputMode === "color"
                    ? "colors"
                    : "value";
        const chain: EraseLayer[] = [first, ...ERASE_CHAIN.filter((layer) => layer !== first)];
        for (const layer of chain) {
            if (this.eraseLayer(layer)) return;
        }
    }

    /** Clears one layer of the selected cells. It returns false (and changes nothing) if they have nothing in it. */
    private eraseLayer(layer: EraseLayer): boolean {
        if (layer === "pen") {
            // Only what lies on the selected cells. The rest of the pen drawing stays.
            const cells = (this.selection.size > 0 ? [...this.selection] : this.cursor ? [this.cursor] : []).flatMap(
                (id) => {
                    const m = /^r(\d+)c(\d+)$/.exec(id);
                    return m ? [{ row: Number(m[1]) - 1, col: Number(m[2]) - 1 }] : [];
                },
            );
            const next = erasePenInCells(this.pen, cells);
            if (next === this.pen) return false;
            this.setPen(next);
            return true;
        }
        // Colours also go on givens. The other layers never touch them.
        const cells =
            layer === "colors"
                ? this.selection.size > 0
                    ? [...this.selection]
                    : this.cursor
                      ? [this.cursor]
                      : []
                : this.targets();
        const hasContent = (c: CellId) => {
            const s = this.board.get(c);
            if (!s) return false;
            return layer === "value" ? s.value !== null : s[layer].length > 0;
        };
        if (!cells.some(hasContent)) return false;

        this.pushPatch(cells);
        this.checkArmed = false;
        for (const cell of cells) {
            const current = this.board.get(cell);
            if (!current) continue;
            this.setOrDrop(cell, layer === "value" ? { ...current, value: null } : { ...current, [layer]: [] });
            if (layer === "value") this.incorrectCells.delete(cell);
        }
        if (layer === "value") this.markDirty(cells);
        this.emit();
        return true;
    }

    undo(): void {
        if (!this.history.undo((entry) => this.applyEntry(entry))) return;
        this.flaggedCells.clear();
        this.incorrectCells.clear();
        this.checkArmed = false;
        this.emit();
    }

    redo(): void {
        if (!this.history.redo((entry) => this.applyEntry(entry))) return;
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
        return boardToProgress(this.board);
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
            const state = progressEntryToState(entry, this.puzzle.domain);
            if (state) this.board.set(cell, state);
        };

        const entries = Object.entries(snapshot).filter(([cell]) => this.geometry.has(cell));
        for (const [cell, entry] of entries) {
            if (!this.isGiven(cell)) setEntry(cell, entry);
            // A visible given keeps only its colour marks. Its value is the clue itself.
            else setEntry(cell, { colors: entry.colors });
        }
        // The saved guess of a given matters only if fog still hid the given when the code saved it.
        // Restore it in the same way that `targets()` allows its entry.
        // Do this after the pass above.
        // The reveal rule uses only the real board and given values.
        // It never uses the entry of a given cell, which is not restored yet.
        const hidden = hiddenCells(this.puzzle, this.valueOf);
        for (const [cell, entry] of entries) {
            if (this.isGiven(cell) && hidden.has(cell)) setEntry(cell, entry);
        }
    }

    // --- history internals -------------------------------------------

    /** Records only the *current* (pre-edit) state of the given cells as the undo step. */
    private pushPatch(cells: readonly CellId[]): void {
        const patch = new Map<CellId, CellState | undefined>();
        for (const cell of cells) patch.set(cell, this.board.get(cell));
        this.pushEntry({ kind: "patch", patch });
    }

    private pushFullSnapshot(): void {
        this.pushEntry({ kind: "full", snapshot: this.serializeBoard() });
    }

    private pushEntry(entry: HistoryEntry): void {
        this.history.push(entry);
    }

    /**
     * Applies a history entry (in either direction).
     * Undo and redo are the same operation on opposite stacks.
     * It returns the inverse entry, to push onto the other stack.
     * A `patch` marks only the cells that it changed as dirty.
     * So undo and redo get the same cheap incremental re-evaluation as a normal edit.
     * A `full` snapshot cannot know what changed without a full board diff.
     * So it invalidates everything.
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

export { lookupFromRecord };
