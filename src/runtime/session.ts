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
    notes: readonly number[];
}

const EMPTY_CELL: CellState = { value: null, notes: [] };

/** Compact, serialisable player progress (entered cells only). */
export type ProgressSnapshot = Readonly<Record<CellId, { value?: number; notes?: readonly number[] }>>;

export type SelectMode = "replace" | "add" | "toggle";

export interface SessionOptions {
    onChange?: () => void;
    initialProgress?: ProgressSnapshot;
}

export class PuzzleSession {
    readonly puzzle: CompiledPuzzle;
    readonly geometry: Geometry;
    noteMode = false;

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
        if (given !== undefined) return { value: given, notes: [] };
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

    setNoteMode(on: boolean): void {
        this.noteMode = on;
        this.emit();
    }

    private targets(): CellId[] {
        const cells = this.selection.size > 0 ? [...this.selection] : this.cursor ? [this.cursor] : [];
        return cells.filter((c) => !this.isGiven(c));
    }

    input(digit: number): void {
        const cells = this.targets();
        if (cells.length === 0) return;
        if (!this.puzzle.domain.includes(digit)) return;

        this.pushHistory();
        for (const cell of cells) {
            if (this.noteMode) {
                const current = this.board.get(cell) ?? EMPTY_CELL;
                if (current.value !== null) continue;
                const notes = new Set(current.notes);
                if (notes.has(digit)) notes.delete(digit);
                else notes.add(digit);
                this.board.set(cell, { value: null, notes: [...notes].sort((a, b) => a - b) });
            } else {
                this.board.set(cell, { value: digit, notes: [] });
            }
        }
        this.emit();
    }

    erase(): void {
        const cells = this.targets();
        if (cells.length === 0) return;
        const hasContent = cells.some((c) => {
            const s = this.board.get(c);
            return s && (s.value !== null || s.notes.length > 0);
        });
        if (!hasContent) return;

        this.pushHistory();
        for (const cell of cells) this.board.delete(cell);
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
        const out: Record<CellId, { value?: number; notes?: readonly number[] }> = {};
        for (const [cell, state] of this.board) {
            if (state.value !== null) out[cell] = { value: state.value };
            else if (state.notes.length > 0) out[cell] = { notes: state.notes };
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
                this.board.set(cell, { value: entry.value, notes: [] });
            } else if (entry.notes && entry.notes.length > 0) {
                this.board.set(cell, { value: null, notes: [...entry.notes].sort((a, b) => a - b) });
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
