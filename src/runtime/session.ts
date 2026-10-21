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
import { evaluate, lookupFromRecord, type EvaluationResult } from "@/runtime/evaluate.ts";

export interface CellState {
    value: number | null;
    /** Corner notes: rendered as a fixed per-digit grid. */
    notes: readonly number[];
    /** Centre (candidate) notes: rendered as a compact growing list. */
    centerNotes: readonly number[];
}

const EMPTY_CELL: CellState = { value: null, notes: [], centerNotes: [] };

const toggleSet = (notes: readonly number[], digit: number): number[] => {
    const set = new Set(notes);
    if (set.has(digit)) set.delete(digit);
    else set.add(digit);
    return [...set].sort((a, b) => a - b);
};

/** Compact, serialisable player progress (entered cells only). */
export type ProgressSnapshot = Readonly<
    Record<CellId, { value?: number; notes?: readonly number[]; centerNotes?: readonly number[] }>
>;

export type SelectMode = "replace" | "add" | "toggle";

export interface SessionOptions {
    onChange?: () => void;
    initialProgress?: ProgressSnapshot;
}

/**
 * What a plain digit press (number pad click or keyboard digit) does.
 * "color" is not implemented yet (#35) but is listed here so pad/session
 * consumers have one seam to extend rather than two.
 */
export type InputMode = "digit" | "corner" | "center";

export class PuzzleSession {
    readonly puzzle: CompiledPuzzle;
    readonly geometry: Geometry;
    inputMode: InputMode = "digit";

    private board = new Map<CellId, CellState>();
    private past: string[] = [];
    private futureStack: string[] = [];
    private selection = new Set<CellId>();
    private cursor: CellId | null = null;
    private readonly listeners = new Set<() => void>();
    private cachedEvaluation: EvaluationResult | null = null;
    private revisionCount = 0;

    constructor(puzzle: CompiledPuzzle, options: SessionOptions = {}) {
        this.puzzle = puzzle;
        this.geometry = createGeometry(puzzle.geometry);
        this.cursor = this.geometry.cells[0] ?? null;
        if (options.onChange) this.listeners.add(options.onChange);
        if (options.initialProgress) this.applyProgress(options.initialProgress);
    }

    // --- subscription -----------------------------------------------------

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    private emit(): void {
        this.cachedEvaluation = null;
        this.revisionCount++;
        for (const listener of this.listeners) listener();
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
        if (given !== undefined) return { value: given, notes: [], centerNotes: [] };
        return this.board.get(cell) ?? EMPTY_CELL;
    }

    valueOf = (cell: CellId): number | null => {
        const given = this.puzzle.givens[cell];
        if (given !== undefined) return given;
        return this.board.get(cell)?.value ?? null;
    };

    getSelection(): ReadonlySet<CellId> {
        return this.selection;
    }

    getCursor(): CellId | null {
        return this.cursor;
    }

    get evaluation(): EvaluationResult {
        if (!this.cachedEvaluation) {
            this.cachedEvaluation = evaluate(this.puzzle, this.valueOf);
        }
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

    selectNone(): void {
        this.selection.clear();
        this.emit();
    }

    moveCursor(dir: Direction, extend = false): void {
        if (!this.cursor) return;
        const next = this.geometry.step(this.cursor, dir);
        if (!next) return;
        this.cursor = next;
        if (extend) this.selection.add(next);
        else this.selection = new Set([next]);
        this.emit();
    }

    // --- mutation -------------------------------------------------------

    setInputMode(mode: InputMode): void {
        this.inputMode = mode;
        this.emit();
    }

    private targets(): CellId[] {
        const cells = this.selection.size > 0 ? [...this.selection] : this.cursor ? [this.cursor] : [];
        return cells.filter((c) => !this.isGiven(c));
    }

    /** Applies a plain digit press according to the active `inputMode`. */
    input(digit: number): void {
        if (this.inputMode === "corner") return this.toggleCornerNote(digit);
        if (this.inputMode === "center") return this.toggleCenterNote(digit);

        const cells = this.targets();
        if (cells.length === 0) return;
        if (!this.puzzle.domain.includes(digit)) return;

        this.pushHistory();
        for (const cell of cells) this.board.set(cell, { value: digit, notes: [], centerNotes: [] });
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

    private toggleNote(digit: number, field: "notes" | "centerNotes"): void {
        const cells = this.targets();
        if (cells.length === 0) return;
        if (!this.puzzle.domain.includes(digit)) return;

        this.pushHistory();
        for (const cell of cells) {
            const current = this.board.get(cell) ?? EMPTY_CELL;
            if (current.value !== null) continue;
            this.board.set(cell, { ...current, [field]: toggleSet(current[field], digit) });
        }
        this.emit();
    }

    /** Clears only the layer matching the active `inputMode` (value / corner / center). */
    erase(): void {
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

        this.pushHistory();
        for (const cell of cells) {
            const current = this.board.get(cell);
            if (!current) continue;
            const next = field === "value" ? { ...current, value: null } : { ...current, [field]: [] };
            if (next.value === null && next.notes.length === 0 && next.centerNotes.length === 0) {
                this.board.delete(cell);
            } else {
                this.board.set(cell, next);
            }
        }
        this.emit();
    }

    undo(): void {
        const previous = this.past.pop();
        if (previous === undefined) return;
        this.futureStack.push(this.serializeBoard());
        this.restoreBoard(previous);
        this.emit();
    }

    redo(): void {
        const next = this.futureStack.pop();
        if (next === undefined) return;
        this.past.push(this.serializeBoard());
        this.restoreBoard(next);
        this.emit();
    }

    reset(): void {
        if (this.board.size === 0) return;
        this.pushHistory();
        this.board.clear();
        this.emit();
    }

    // --- persistence ---------------------------------------------------

    toProgress(): ProgressSnapshot {
        const out: Record<CellId, { value?: number; notes?: readonly number[]; centerNotes?: readonly number[] }> = {};
        for (const [cell, state] of this.board) {
            if (state.value !== null) {
                out[cell] = { value: state.value };
            } else if (state.notes.length > 0 || state.centerNotes.length > 0) {
                const entry: { notes?: readonly number[]; centerNotes?: readonly number[] } = {};
                if (state.notes.length > 0) entry.notes = state.notes;
                if (state.centerNotes.length > 0) entry.centerNotes = state.centerNotes;
                out[cell] = entry;
            }
        }
        return out;
    }

    loadProgress(snapshot: ProgressSnapshot): void {
        this.pushHistory();
        this.applyProgress(snapshot);
        this.emit();
    }

    private applyProgress(snapshot: ProgressSnapshot): void {
        this.board.clear();
        for (const [cell, entry] of Object.entries(snapshot)) {
            if (!this.geometry.has(cell) || this.isGiven(cell)) continue;
            if (entry.value !== undefined && this.puzzle.domain.includes(entry.value)) {
                this.board.set(cell, { value: entry.value, notes: [], centerNotes: [] });
                continue;
            }
            const notes = entry.notes ? [...entry.notes].sort((a, b) => a - b) : [];
            const centerNotes = entry.centerNotes ? [...entry.centerNotes].sort((a, b) => a - b) : [];
            if (notes.length > 0 || centerNotes.length > 0) {
                this.board.set(cell, { value: null, notes, centerNotes });
            }
        }
    }

    // --- history internals -------------------------------------------

    private pushHistory(): void {
        this.past.push(this.serializeBoard());
        if (this.past.length > 200) this.past.shift();
        this.futureStack = [];
    }

    private serializeBoard(): string {
        return JSON.stringify([...this.board.entries()]);
    }

    private restoreBoard(serialized: string): void {
        this.board = new Map(JSON.parse(serialized) as [CellId, CellState][]);
    }
}

export const progressStorageKey = (puzzleId: string): string => `cpr:progress:${puzzleId}`;

export { lookupFromRecord };
