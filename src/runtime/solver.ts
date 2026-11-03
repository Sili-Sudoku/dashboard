/**
 * Existence and uniqueness solver: backtracking search over any compiled puzzle.
 * `evaluate.ts` is the oracle for constraint legality, with one exception (below).
 *
 * Why forward checking with a cheap direct check: large Sudoku-shaped boards need lookahead to avoid dead ends,
 * and the lookahead must cost less than it saves. Measured on a 25x25 board:
 *   - Lookahead through the generic oracle only: thousands of oracle calls per assignment. Too slow.
 *   - Plain backtracking, with or without a cheap check: the tree grows too large
 *     (a row-major fill of an empty 25x25 filled 45 of 625 cells in 3 seconds).
 *
 * A plain `allDifferent` over a region is the common rule. A value is legal if no filled peer has it.
 * `isSimpleAllDifferent` finds this shape, and the solver checks it directly with no expression evaluation.
 * Every other shape (thermometers, cages, whisper lines, bespoke rules) goes through the oracle.
 * This is the only place in the file that knows what an operator means.
 *
 * The search stops at a second solution. It has a budget of oracle calls and of wall-clock time,
 * and the time check is in the search loop itself. If a budget runs out, the result is "unknown", not a guess.
 *
 * Out of scope: difficulty rating, and solving with human techniques only.
 */

import type { CellId } from "@/runtime/geometry.ts";
import { createGeometry } from "@/runtime/geometry.ts";
import { isCall, type Expr } from "@/runtime/expression.ts";
import { evaluate, evaluateIncremental, type EvaluationResult, type ValueLookup } from "@/runtime/evaluate.ts";
import type { CompiledPuzzle } from "@/runtime/puzzle.ts";

export interface SolveOptions {
    /** Oracle-call budget. If the search exceeds it, the result is "unknown". */
    maxProbes?: number;
    /** Wall-clock budget in milliseconds. This is the real limit, because the cost of a probe is not uniform. */
    maxMs?: number;
}

export type SolveStatus = "unique" | "multiple" | "none" | "unknown";

export interface SolveResult {
    status: SolveStatus;
    /** The first solution found, if the search found at least one. */
    solution?: Readonly<Record<CellId, number>>;
    /** Number of oracle (evaluateIncremental) calls, for diagnostics and tests. */
    probes: number;
}

const DEFAULT_MAX_PROBES = 2_000_000;
const DEFAULT_MAX_MS = 2_000;

/**
 * True only if `expr` is exactly `[allDifferent|distinct, [cells|region|values, selector]]`.
 * The `selector` must be a bare string (a region selector such as "row:0") or a literal
 * array of cell-id strings. This means "these raw cell values are all different".
 * No value is transformed or composed.
 * The test is conservative. Any other shape goes to the generic oracle and is never classified as simple.
 * Examples are an expression nested inside `not` or `and`, and one built from `["list", ...]`,
 * arithmetic, or other operators.
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
    /** For each cell, the full cell groups (including the cell) of each simple allDifferent that touches it. */
    groupsByCell: ReadonlyMap<CellId, readonly (readonly CellId[])[]>;
    /** Cells that at least one non-simple constraint touches. These still need the generic oracle. */
    hasComplex: ReadonlySet<CellId>;
    /** Each other cell that shares a constraint (simple or complex) with a cell. Forward checking uses these. */
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

/** O(group size) direct check. Does any OTHER filled cell in a simple group of `cell` already hold `value`? */
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
 * The longest time the search can run before it gives control back to the event loop.
 * The recursive search has no awaits of its own.
 * Without this limit, a solve of several seconds (within the normal budget) would freeze the calling page.
 * The value is below one frame (about 16ms), so the page stays responsive to input and repaints
 * while a solve runs in the background.
 */
const YIELD_INTERVAL_MS = 12;

/** Uses the Scheduler API `yield()` where available. It resumes as a normal-priority task
 *  and has no minimum delay enforced by the browser. Otherwise it uses a `setTimeout` macrotask. */
const yieldToEventLoop = (): Promise<void> => {
    const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (scheduler?.yield) return scheduler.yield();
    return new Promise((resolve) => setTimeout(resolve, 0));
};

/** Each oracle call goes through here, so the budgets limit the wall-clock work. */
const probe = (
    state: SearchState,
    baseline: EvaluationResult,
    changed: readonly CellId[],
): EvaluationResult | undefined => {
    if (state.truncated) return undefined;
    state.probes++;
    if (state.probes > state.maxProbes || performance.now() > state.deadline) {
        state.truncated = true;
        return undefined;
    }
    return evaluateIncremental(state.puzzle, state.lookup, baseline, changed, { skipInfeasibilitySearch: true });
};

/**
 * Tests if `cell = value` is legal on top of the current board.
 * It does the cheap direct check first. This check is always correct for plain allDifferent groups.
 * It uses the generic oracle only if a constraint that is not a plain allDifferent touches `cell`.
 * `baseline` is the evaluation that the oracle updates incrementally, if it is necessary.
 * The returned `next` has a meaning only when `legal` is true.
 * When the solver does not use the oracle, `next` is equal to `baseline`.
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
 * A cell in the map is still open. Its value is its current candidate list.
 * The search changes the map in place and logs each changed entry in `undoLog`, then restores from it on
 * backtrack. Copying the map at every node cost O(open cells) even when the node touched few cells:
 * on a 25x25 board the copies used the whole budget. Now a node costs its actual fan-out.
 */
type Domains = Map<CellId, readonly number[]>;
type UndoLog = (readonly [CellId, readonly number[]])[];

/**
 * Forward checking. The `changed` cells were just fixed on top of `board`, and `baseline` is the evaluation
 * after that. This narrows, in place, the candidate domains of their open constraint neighbors with `checkLegal`
 * (cheap for plain allDifferent, the oracle only for genuine variant constraints).
 * It appends each previous domain to `undoLog` for exact restore on backtrack.
 * It returns false if a neighbor's domain becomes empty (a dead branch) or the budget ends.
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
    // This check is unconditional and not only inside `probe()`.
    // A puzzle that has only plain allDifferent rules never calls the oracle,
    // so no other check would limit the wall-clock time.
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
        if (onSolution()) state.truncated = true; // The caller signals "stop": it has enough solutions.
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

    domains.delete(cell); // Remove the cell from the "open" set while the search branches on it.

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

    domains.set(cell, candidates); // Put the cell back in the "open" set for the remaining candidates of the caller.
};

/**
 * Async, because the search yields to the event loop at intervals (see `YIELD_INTERVAL_MS`).
 * This stops a solve of several seconds from freezing the calling page.
 * To await this function is to wait for a background task. It does not block.
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
