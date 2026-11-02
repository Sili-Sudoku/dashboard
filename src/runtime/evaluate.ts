/**
 * Evaluate a compiled puzzle against a board state.
 *
 * Kleene logic gives each constraint one of three statuses:
 *   - satisfied   the expression is definitely true
 *   - violated    the expression is definitely false
 *   - incomplete  too few cells are filled to decide
 *
 * The puzzle is `valid` when no constraint is violated.
 * The puzzle is `complete` when every cell is filled and every constraint is satisfied.
 */

import type { CellId, Geometry } from "@/runtime/geometry.ts";
import { createGeometry } from "@/runtime/geometry.ts";
import { isCall, type EvalContext } from "@/runtime/expression.ts";
import { evalExpr } from "@/runtime/operators.ts";
import type { CompiledPuzzle } from "@/runtime/puzzle.ts";

/**
 * A constraint is "incomplete", not "violated", while any cell in its footprint is empty.
 * But some incomplete constraints are already dead.
 * No assignment of the remaining empty cells can satisfy them.
 * Examples: a thermometer head too high to leave room for the rest of the climb,
 * or a cage target that the domain cannot reach.
 * This function finds such constraints early, before a literal rule break exists.
 * It works for every operator without extra code.
 * It runs the existing evaluator on every possible completion of the empty cells of the constraint.
 * Then it checks if any completion avoids `false`.
 * It has no bounds logic for each operator.
 * This works because the operators are pure functions over `valueOf`.
 *
 * The search is exhaustive, so it has a cap.
 * Above the cap, the function makes no claim and the status stays "incomplete".
 * It does not guess, because it must never report a violation that it cannot prove.
 */
const INFEASIBILITY_SEARCH_CAP = 20_000;

const isProvablyInfeasible = (
    expr: CompiledPuzzle["constraints"][number]["expr"],
    scope: readonly CellId[],
    ctx: EvalContext,
    lookup: ValueLookup,
): boolean => {
    const emptyCells = scope.filter((c) => lookup(c) === null);
    if (emptyCells.length === 0) return false;

    const domain = ctx.domain;
    const searchSpace = domain.length ** emptyCells.length;
    if (domain.length === 0 || searchSpace > INFEASIBILITY_SEARCH_CAP) return false;

    const overrides = new Map<CellId, number>();
    const trialLookup: ValueLookup = (cell) => (overrides.has(cell) ? overrides.get(cell)! : lookup(cell));
    const trialCtx: EvalContext = { ...ctx, valueOf: trialLookup };

    const anySatisfiesFrom = (index: number): boolean => {
        if (index === emptyCells.length) {
            try {
                const value = evalExpr(expr, trialCtx);
                return value.t !== "bool" || value.v !== false;
            } catch {
                return true; // Other code reports malformed expressions, not this code.
            }
        }
        const cell = emptyCells[index];
        for (const v of domain) {
            overrides.set(cell, v);
            if (anySatisfiesFrom(index + 1)) return true;
        }
        overrides.delete(cell);
        return false;
    };

    return !anySatisfiesFrom(0);
};

export type ConstraintStatus = "satisfied" | "violated" | "incomplete";

export interface ConstraintEvaluation {
    id: string;
    source: string;
    label?: string;
    status: ConstraintStatus;
    cells: readonly CellId[];
    error?: string;
}

export interface EvaluationResult {
    status: "valid" | "invalid";
    complete: boolean;
    filledCount: number;
    cellCount: number;
    constraints: readonly ConstraintEvaluation[];
    /** Cells that belong to at least one violated constraint. */
    violatedCells: ReadonlySet<CellId>;
    /** Cells with an entered value that is outside the puzzle domain. */
    invalidCells: ReadonlySet<CellId>;
}

/** How the evaluator reads the board: the entered value of a cell, or null. */
export type ValueLookup = (cell: CellId) => number | null;

export const lookupFromRecord = (
    values: Readonly<Record<CellId, number | null | undefined>>,
): ValueLookup => {
    return (cell) => {
        const v = values[cell];
        return v === undefined || v === null ? null : v;
    };
};

/** The expensive part: runs the expression of one constraint (and the infeasibility search) against the board. */
const evaluateOneConstraint = (
    constraint: CompiledPuzzle["constraints"][number],
    ctx: EvalContext,
    lookup: ValueLookup,
    skipInfeasibilitySearch: boolean,
): ConstraintEvaluation => {
    let status: ConstraintStatus;
    let error: string | undefined;
    try {
        const value = evalExpr(constraint.expr, ctx);
        if (value.t === "bool") status = value.v ? "satisfied" : "violated";
        else if (value.t === "unknown") status = "incomplete";
        else {
            status = "violated";
            error = `constraint did not evaluate to a boolean (got ${value.t})`;
        }
    } catch (err) {
        status = "violated";
        error = err instanceof Error ? err.message : String(err);
    }

    if (
        status === "incomplete" &&
        !skipInfeasibilitySearch &&
        isProvablyInfeasible(constraint.expr, constraint.cells, ctx, lookup)
    ) {
        status = "violated";
        error = "no assignment of the remaining empty cells can satisfy this constraint";
    }

    return {
        id: constraint.id,
        source: constraint.source,
        label: constraint.label,
        status,
        cells: constraint.cells,
        error,
    };
};

/** The cheap part: board-wide bookkeeping (fill, domain, and violated-cell sets) from the decided statuses. */
const finalize = (
    puzzle: CompiledPuzzle,
    geometry: Geometry,
    lookup: ValueLookup,
    constraints: readonly ConstraintEvaluation[],
): EvaluationResult => {
    const domainSet = new Set(puzzle.domain);
    const invalidCells = new Set<CellId>();
    let filledCount = 0;
    for (const cell of geometry.cells) {
        const v = lookup(cell);
        if (v === null) continue;
        filledCount++;
        if (!domainSet.has(v)) invalidCells.add(cell);
    }

    const violatedCells = new Set<CellId>();
    let anyViolated = false;
    let allSatisfied = true;

    for (let i = 0; i < puzzle.constraints.length; i++) {
        const compiled = puzzle.constraints[i];
        const result = constraints[i];
        if (result.status === "violated") {
            anyViolated = true;
            allSatisfied = false;
            const head = isCall(compiled.expr) ? compiled.expr[0] : undefined;
            const narrowed =
                head === "allDifferent" || head === "distinct" ? duplicateValueCells(compiled.cells, lookup) : [];
            const cells = narrowed.length > 0 ? narrowed : compiled.cells;
            for (const c of cells) violatedCells.add(c);
        } else if (result.status === "incomplete") {
            allSatisfied = false;
        }
    }

    return {
        status: anyViolated || invalidCells.size > 0 ? "invalid" : "valid",
        complete: filledCount === geometry.cells.length && allSatisfied && invalidCells.size === 0,
        filledCount,
        cellCount: geometry.cells.length,
        constraints,
        violatedCells,
        invalidCells,
    };
};

export interface EvaluateOptions {
    /**
     * Skip the infeasibility search of each constraint (see `isProvablyInfeasible` above).
     * This search gives the live player instant "this is already dead" feedback on variant rules,
     * with no code for each operator.
     * But it is a real brute-force search.
     * A caller that does its own search does not need this copy.
     * An example is the backtracking of a solver, which finds the same infeasibility a few levels deeper.
     * The default is off, so each existing caller (the live player, authoring validation) keeps its behavior.
     */
    skipInfeasibilitySearch?: boolean;
}

export const evaluate = (
    puzzle: CompiledPuzzle,
    lookup: ValueLookup,
    options: EvaluateOptions = {},
): EvaluationResult => {
    const geometry = createGeometry(puzzle.geometry);
    const ctx: EvalContext = { geometry, regions: puzzle.regions, domain: puzzle.domain, valueOf: lookup };
    const constraints = puzzle.constraints.map((c) =>
        evaluateOneConstraint(c, ctx, lookup, options.skipInfeasibilitySearch ?? false),
    );
    return finalize(puzzle, geometry, lookup, constraints);
};

/**
 * Re-evaluates only the constraints that touch `changedCells`.
 * It reuses the status of each other constraint from `previous`.
 * This fixes the cost of each keystroke.
 * `evaluate()` alone re-runs the expression (and infeasibility search) of every constraint on every edit,
 * even when the edit is local.
 * The board-wide bookkeeping (fill, invalid, and violated-cell sets) is still recomputed.
 * That part is a cheap linear pass and is not the bottleneck.
 * Only the expression evaluation of each unaffected constraint is skipped.
 */
export const evaluateIncremental = (
    puzzle: CompiledPuzzle,
    lookup: ValueLookup,
    previous: EvaluationResult,
    changedCells: Iterable<CellId>,
    options: EvaluateOptions = {},
): EvaluationResult => {
    const geometry = createGeometry(puzzle.geometry);
    const affected = new Set(affectedConstraints(puzzle, changedCells));

    // Board-wide bookkeeping (filledCount/invalidCells) can change even for a cell
    // that belongs to no constraint.
    // So the code always recomputes it below.
    // Only the expensive expression evaluation of each constraint is skipped, if possible.
    if (affected.size === 0) return finalize(puzzle, geometry, lookup, previous.constraints);

    const ctx: EvalContext = { geometry, regions: puzzle.regions, domain: puzzle.domain, valueOf: lookup };
    const constraints = puzzle.constraints.map((c, i) =>
        affected.has(c.id)
            ? evaluateOneConstraint(c, ctx, lookup, options.skipInfeasibilitySearch ?? false)
            : previous.constraints[i],
    );
    return finalize(puzzle, geometry, lookup, constraints);
};

/**
 * Narrows an `allDifferent`/`distinct` violation to the cells that share a duplicate value.
 * It does not use every cell that the group spans.
 * Example: a 9-cell row with one repeated digit highlights the 2 offending cells, not all 9.
 */
const duplicateValueCells = (cells: readonly CellId[], lookup: ValueLookup): readonly CellId[] => {
    const byValue = new Map<number, CellId[]>();
    for (const cell of cells) {
        const v = lookup(cell);
        if (v === null) continue;
        const group = byValue.get(v);
        if (group) group.push(cell);
        else byValue.set(v, [cell]);
    }
    return [...byValue.values()].filter((group) => group.length > 1).flat();
};

/**
 * The constraints with a footprint that includes any of the changed cells.
 * These constraints need a new check after an edit, for callers that want incremental updates.
 */
export const affectedConstraints = (
    puzzle: CompiledPuzzle,
    changed: Iterable<CellId>,
): readonly string[] => {
    const changedSet = new Set(changed);
    return puzzle.constraints
        .filter((c) => c.cells.some((cell) => changedSet.has(cell)))
        .map((c) => c.id);
};
