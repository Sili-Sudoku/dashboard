/**
 * Generic existence/uniqueness solver: backtracking search over any compiled
 * puzzle, using `evaluate.ts` as the oracle for constraint legality — except
 * for one deliberate, narrow exception described below.
 *
 * Three prior designs were tried and measured before this one:
 *   - Forward-checking through the generic oracle only: for every
 *     assignment, proactively re-check every candidate of every
 *     constraint-neighbor via `evaluateIncremental`. Correct, but on a large
 *     board a single assignment fans out into thousands of oracle calls —
 *     the lookahead cost dwarfed what it saved.
 *   - Plain backtracking through the generic oracle (one call per
 *     assignment, no lookahead): cheap per node, but search-tree size
 *     exploded — the textbook failure mode of backtracking without any
 *     propagation on Sudoku-shaped problems (confirmed empirically: a plain
 *     row-major fill on an empty 25x25 filled 45 of 625 cells in 3 seconds).
 *   - Plain backtracking with the oracle replaced by a cheap direct check
 *     (see below) but still no lookahead: each node got far cheaper, but
 *     search-tree size alone can still explode on a large, lightly
 *     constrained board even when every node is nearly free — a 25x25 with
 *     under ~70% of cells given still thrashed for seconds.
 *
 * All three share one lesson: a large Sudoku-shaped board needs *both*
 * lookahead (to avoid thrashing into dead ends) *and* for that lookahead to
 * be cheap (so it doesn't cost more than it saves). Hence forward-checking
 * is back, but the thing it probes is no longer always the generic oracle:
 *
 * For a plain `allDifferent` over a region — the overwhelming majority of
 * rules in any Sudoku-shaped puzzle — legality is just "is this value
 * already used by a filled peer in the group," an O(group size) membership
 * check with no expression evaluation needed. Recognizing that shape
 * (`isSimpleAllDifferent` below) and checking it directly makes
 * forward-checking's lookahead nearly free for ordinary rules. Any
 * constraint that doesn't match that shape — true variants: thermometers,
 * cages, whisper lines, anything bespoke — still goes through the full
 * generic oracle exactly as before. This is the one place this file knows
 * what an operator means; everything else stays generic.
 *
 * Search stops as soon as a second solution is found (existence/uniqueness
 * only), and is budgeted by oracle-call count and wall-clock time; exceeding
 * either reports "unknown" rather than guessing. The wall-clock check lives
 * in the search loop itself, not only inside the oracle call: a puzzle made
 * entirely of plain allDifferent rules may never call the oracle at all.
 *
 * Deliberately out of scope: difficulty rating / human-technique-only
 * solving. This proves existence and uniqueness for authoring, nothing more.
 */

import type { CellId } from "@/runtime/geometry.ts";
import { createGeometry } from "@/runtime/geometry.ts";
import { isCall, type Expr } from "@/runtime/expression.ts";
import { evaluate, evaluateIncremental, type EvaluationResult, type ValueLookup } from "@/runtime/evaluate.ts";
import type { CompiledPuzzle } from "@/runtime/puzzle.ts";

export interface SolveOptions {
    /** Oracle-call budget. Exceeding it reports "unknown" rather than guessing. */
    maxProbes?: number;
    /** Wall-clock budget in milliseconds — the real backstop, since probe cost isn't uniform. */
    maxMs?: number;
}

export type SolveStatus = "unique" | "multiple" | "none" | "unknown";

export interface SolveResult {
    status: SolveStatus;
    /** The first solution found, whenever the search found at least one. */
    solution?: Readonly<Record<CellId, number>>;
    /** Oracle (evaluateIncremental) calls made, for diagnostics/tests. */
    probes: number;
}

const DEFAULT_MAX_PROBES = 2_000_000;
const DEFAULT_MAX_MS = 2_000;

/**
 * True iff `expr` is exactly `[allDifferent|distinct, [cells|region|values, selector]]`
 * with `selector` a bare string (a region selector like "row:0") or a literal
 * array of cell-id strings — i.e. "these raw cell values are pairwise
 * distinct," nothing transformed, nothing composed. Deliberately
 * conservative: anything that doesn't match this exact shape (nested inside
 * `not`/`and`, or built from `["list", ...]`/arithmetic/other operators)
 * falls through to the generic oracle, never misclassified as simple.
 */
const isSimpleAllDifferent = (expr: Expr): boolean => {
    if (!isCall(expr) || expr.length !== 2) return false;
    const [head, arg] = expr;
    if (head !== "allDifferent" && head !== "distinct") return false;
    if (!isCall(arg) || arg.length !== 2) return false;
    const [argHead, sel] = arg;
    if (argHead !== "cells" && argHead !== "region" && argHead !== "values") return false;
    if (typeof sel === "string") return true;
    return Array.isArray(sel) && sel.every((s) => typeof s === "string");
};

interface Classification {
    /** For each cell, the full cell-groups (including itself) of every simple allDifferent touching it. */
    groupsByCell: ReadonlyMap<CellId, readonly (readonly CellId[])[]>;
    /** Cells touched by at least one non-simple constraint — these still need the generic oracle. */
    hasComplex: ReadonlySet<CellId>;
    /** Every other cell sharing any constraint (simple or complex) with a cell — forward-checking's scope. */
    neighbors: ReadonlyMap<CellId, readonly CellId[]>;
}

const classify = (puzzle: CompiledPuzzle): Classification => {
    const groupsByCell = new Map<CellId, (readonly CellId[])[]>();
    const hasComplex = new Set<CellId>();
    const neighborSets = new Map<CellId, Set<CellId>>();
    for (const c of puzzle.constraints) {
        const simple = isSimpleAllDifferent(c.expr);
        for (const cell of c.cells) {
            if (simple) {
                const groups = groupsByCell.get(cell);
                if (groups) groups.push(c.cells);
                else groupsByCell.set(cell, [c.cells]);
            } else {
                hasComplex.add(cell);
            }
            let set = neighborSets.get(cell);
            if (!set) {
                set = new Set();
                neighborSets.set(cell, set);
            }
            for (const other of c.cells) if (other !== cell) set.add(other);
        }
    }
    const neighbors = new Map<CellId, readonly CellId[]>();
    for (const [cell, set] of neighborSets) neighbors.set(cell, [...set]);
    return { groupsByCell, hasComplex, neighbors };
};

/** O(group size) direct check: does any OTHER filled cell in one of `cell`'s simple groups already hold `value`? */
const cheapConflict = (
    cell: CellId,
    value: number,
    board: ReadonlyMap<CellId, number>,
    groupsByCell: Classification["groupsByCell"],
): boolean => {
    for (const group of groupsByCell.get(cell) ?? []) {
        for (const other of group) {
            if (other !== cell && board.get(other) === value) return true;
        }
    }
    return false;
};

interface SearchState {
    readonly puzzle: CompiledPuzzle;
    readonly board: Map<CellId, number>;
    readonly lookup: ValueLookup;
    readonly classification: Classification;
    readonly maxProbes: number;
    readonly deadline: number;
    probes: number;
    truncated: boolean;
    lastYield: number;
}

/**
 * How long the search is allowed to run without handing control back to the
 * event loop. The recursive search has no awaits of its own — without this,
 * a multi-second solve (well within the normal budget) would freeze
 * whatever page called it for that whole time. Picked to land comfortably
 * under one frame (~16ms) so the page stays responsive to input/repaints
 * while a solve runs in the background.
 */
const YIELD_INTERVAL_MS = 12;

/** Prefers the Scheduler API's `yield()` (resumes as a normal-priority task, no browser-enforced
 *  minimum delay) where available; falls back to a `setTimeout` macrotask everywhere else. */
const yieldToEventLoop = (): Promise<void> => {
    const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (scheduler?.yield) return scheduler.yield();
    return new Promise((resolve) => setTimeout(resolve, 0));
};

/** Every oracle call goes through here so the budgets actually bound wall-clock work. */
const probe = (state: SearchState, baseline: EvaluationResult, changed: readonly CellId[]): EvaluationResult | undefined => {
    if (state.truncated) return undefined;
    state.probes++;
    if (state.probes > state.maxProbes || performance.now() > state.deadline) {
        state.truncated = true;
        return undefined;
    }
    return evaluateIncremental(state.puzzle, state.lookup, baseline, changed, { skipInfeasibilitySearch: true });
};

/**
 * Legality of assigning `cell = value` on top of the current board: the
 * cheap direct check first (always correct for plain allDifferent groups),
 * falling back to the generic oracle only if `cell` is touched by a
 * constraint that isn't a plain allDifferent. `baseline` is the evaluation
 * to incrementally update from if the oracle is needed; the returned
 * `next` is only meaningful when `legal` is true, and equals `baseline`
 * unchanged when the oracle wasn't consulted.
 */
const checkLegal = (
    state: SearchState,
    cell: CellId,
    value: number,
    baseline: EvaluationResult,
): { legal: boolean; next: EvaluationResult } => {
    if (cheapConflict(cell, value, state.board, state.classification.groupsByCell)) {
        return { legal: false, next: baseline };
    }
    if (!state.classification.hasComplex.has(cell)) {
        return { legal: true, next: baseline };
    }
    const trial = probe(state, baseline, [cell]);
    if (!trial) return { legal: false, next: baseline };
    return { legal: trial.status !== "invalid", next: trial };
};

/**
 * Mutated in place for the whole search, never copied: a cell's presence
 * means "still open," its value is that cell's current candidate list. A
 * prior design rebuilt this map (`new Map(domains)`) on every node — an
 * O(total open cells) cost paid at every node regardless of how few cells
 * that node's propagation actually touched, which dominated everything once
 * the board was large (measured: a 25x25 spent its whole budget copying,
 * reaching barely any depth). Mutating in place and logging exactly which
 * entries changed — restored via `undoLog` on the way back up — makes each
 * node's cost proportional to its actual fan-out instead of to board size.
 */
type Domains = Map<CellId, readonly number[]>;
type UndoLog = (readonly [CellId, readonly number[]])[];

/**
 * Forward checking: given that `changed` cells were just fixed (on top of
 * `board`, with `baseline` the evaluation after fixing them), narrow the
 * candidate domains of their still-open constraint neighbors in place via
 * `checkLegal` — cheap for plain allDifferent neighbors, falling back to the
 * oracle only for neighbors touched by a genuine variant constraint. Every
 * domain actually changed is appended to `undoLog` (previous value) so the
 * caller can restore it exactly on backtrack. Returns false if any
 * neighbor's domain becomes empty (a dead branch) or the budget runs out.
 */
const narrowNeighbors = (
    state: SearchState,
    changed: readonly CellId[],
    domains: Domains,
    baseline: EvaluationResult,
    undoLog: UndoLog,
): boolean => {
    const toCheck = new Set<CellId>();
    for (const cell of changed) {
        for (const n of state.classification.neighbors.get(cell) ?? []) {
            if (domains.has(n)) toCheck.add(n);
        }
    }

    for (const other of toCheck) {
        const current = domains.get(other)!;
        const kept: number[] = [];
        for (const value of current) {
            state.board.set(other, value);
            const { legal } = checkLegal(state, other, value, baseline);
            if (legal) kept.push(value);
            if (state.truncated) {
                state.board.delete(other);
                return false;
            }
        }
        state.board.delete(other);
        if (kept.length === 0) return false;
        if (kept.length !== current.length) {
            undoLog.push([other, current]);
            domains.set(other, kept);
        }
    }
    return true;
};

const search = async (
    state: SearchState,
    domains: Domains,
    previous: EvaluationResult,
    onSolution: () => boolean,
): Promise<void> => {
    if (state.truncated) return;
    // Checked here unconditionally, not only inside `probe()`: a puzzle made
    // entirely of plain allDifferent rules never calls the oracle at all, so
    // nothing else would bound wall-clock time.
    const t = performance.now();
    if (t > state.deadline) {
        state.truncated = true;
        return;
    }
    if (t - state.lastYield > YIELD_INTERVAL_MS) {
        await yieldToEventLoop();
        state.lastYield = performance.now();
        if (state.lastYield > state.deadline) {
            state.truncated = true;
            return;
        }
    }

    if (domains.size === 0) {
        if (onSolution()) state.truncated = true; // caller signals "stop": enough solutions found
        return;
    }

    let cell: CellId | undefined;
    let candidates: readonly number[] | undefined;
    for (const [c, vals] of domains) {
        if (!candidates || vals.length < candidates.length) {
            cell = c;
            candidates = vals;
            if (vals.length <= 1) break;
        }
    }
    if (!cell || !candidates) return;

    domains.delete(cell); // out of the "open" set while we branch on it

    for (const value of candidates) {
        state.board.set(cell, value);
        const { legal, next: trial } = checkLegal(state, cell, value, previous);
        if (legal) {
            const undoLog: UndoLog = [];
            if (narrowNeighbors(state, [cell], domains, trial, undoLog)) {
                await search(state, domains, trial, onSolution);
            }
            for (let i = undoLog.length - 1; i >= 0; i--) domains.set(undoLog[i][0], undoLog[i][1]);
        }
        state.board.delete(cell);
        if (state.truncated) break;
    }

    domains.set(cell, candidates); // restore to the "open" set for the caller's own remaining candidates
};

/**
 * Async because the search yields back to the event loop periodically (see
 * `YIELD_INTERVAL_MS`) so a multi-second solve doesn't freeze whatever page
 * called it — awaiting this is a background task, not a blocking call.
 */
export const solve = async (puzzle: CompiledPuzzle, options: SolveOptions = {}): Promise<SolveResult> => {
    const geometry = createGeometry(puzzle.geometry);
    const board = new Map<CellId, number>(Object.entries(puzzle.givens));
    const lookup: ValueLookup = (cell) => board.get(cell) ?? null;

    const state: SearchState = {
        puzzle,
        board,
        lookup,
        classification: classify(puzzle),
        maxProbes: options.maxProbes ?? DEFAULT_MAX_PROBES,
        deadline: performance.now() + (options.maxMs ?? DEFAULT_MAX_MS),
        probes: 0,
        truncated: false,
        lastYield: performance.now(),
    };

    const initialEval = evaluate(puzzle, lookup);
    if (initialEval.status === "invalid") return { status: "none", probes: 0 };

    const domains: Domains = new Map(
        geometry.cells.filter((c) => !board.has(c)).map((c) => [c, puzzle.domain] as const),
    );
    const seedUndo: UndoLog = [];
    const seeded = narrowNeighbors(state, [...board.keys()], domains, initialEval, seedUndo);
    if (state.truncated) return { status: "unknown", probes: state.probes };
    if (!seeded) return { status: "none", probes: state.probes };

    let solutionCount = 0;
    let solution: Record<CellId, number> | undefined;
    await search(state, domains, initialEval, () => {
        solutionCount++;
        if (!solution) solution = Object.fromEntries(board);
        return solutionCount >= 2;
    });

    if (solutionCount === 0) return { status: state.truncated ? "unknown" : "none", probes: state.probes };
    if (solutionCount === 1) return { status: state.truncated ? "unknown" : "unique", solution, probes: state.probes };
    return { status: "multiple", solution, probes: state.probes };
};
