/**
 * Generic existence and uniqueness solver. It does a backtracking search over any compiled puzzle.
 * It uses `evaluate.ts` as the oracle for constraint legality, with one narrow exception (see below).
 *
 * The team tried three designs before this one and measured each:
 *   - Forward checking through the generic oracle only. For each assignment, the solver re-checks
 *     every candidate of every constraint neighbor with `evaluateIncremental`. This is correct.
 *     On a large board, one assignment causes thousands of oracle calls.
 *     The lookahead cost more than it saved.
 *   - Plain backtracking through the generic oracle. It makes one call per assignment and has no lookahead.
 *     Each node is cheap, but the search tree grows too large.
 *     This is the known failure of backtracking without propagation on Sudoku-shaped problems.
 *     A test confirmed it: a plain row-major fill on an empty 25x25 filled 45 of 625 cells in 3 seconds.
 *   - Plain backtracking with a cheap direct check in place of the oracle (see below), but no lookahead.
 *     Each node is much cheaper, but the search tree can still grow too large.
 *     This happens on a large board with few constraints, even when every node is nearly free.
 *     A 25x25 board with fewer than about 70% of cells given still ran for seconds.
 *
 * All three designs show the same lesson.
 * A large Sudoku-shaped board needs lookahead, to avoid dead ends.
 * The lookahead must also be cheap, so that it costs less than it saves.
 * Therefore forward checking is back, but it does not always probe the generic oracle:
 *
 * A plain `allDifferent` over a region is the most common rule in a Sudoku-shaped puzzle.
 * For this rule, a value is legal if no filled peer in the group has it.
 * This is an O(group size) membership check and needs no expression evaluation.
 * The function `isSimpleAllDifferent` (below) finds this shape.
 * The direct check makes the lookahead nearly free for ordinary rules.
 * Each constraint with a different shape still goes through the full generic oracle.
 * These are the true variants: thermometers, cages, whisper lines, and any bespoke constraint.
 * This is the only place in this file that knows what an operator means.
 * All other code stays generic.
 *
 * The search stops when it finds a second solution, because it only tests existence and uniqueness.
 * The search has a budget of oracle calls and a budget of wall-clock time.
 * If it exceeds one of them, it reports "unknown" and does not guess.
 * The wall-clock check is in the search loop itself, not only in the oracle call.
 * A puzzle that has only plain allDifferent rules can finish without one oracle call.
 *
 * Out of scope: difficulty rating and solving with human techniques only.
 * This file proves existence and uniqueness for authoring, and nothing more.
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
 * The search changes this map in place and never copies it.
 * A cell in the map is still open. Its value is the current candidate list of that cell.
 * An earlier design rebuilt this map (`new Map(domains)`) at every node.
 * That cost O(total open cells) at every node, even when the propagation of the node touched few cells.
 * On a large board this cost dominated everything.
 * Measurement: a 25x25 board used its whole budget on copies and reached very little depth.
 * Now the search changes the map in place and logs each changed entry.
 * It restores the entries from `undoLog` when it goes back up.
 * So the cost of a node depends on its actual fan-out, not on the board size.
 */
type Domains = Map<CellId, readonly number[]>;
type UndoLog = (readonly [CellId, readonly number[]])[];

/**
 * Forward checking. The `changed` cells were just fixed on top of `board`.
 * `baseline` is the evaluation after the solver fixed them.
 * This function narrows, in place, the candidate domains of their open constraint neighbors with `checkLegal`.
 * The check is cheap for plain allDifferent neighbors.
 * It uses the oracle only for neighbors that a genuine variant constraint touches.
 * It appends each changed domain (the previous value) to `undoLog`,
 * so the caller can restore it exactly on backtrack.
 * It returns false if the domain of a neighbor becomes empty (a dead branch) or if the budget ends.
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
