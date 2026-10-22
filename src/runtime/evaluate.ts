/**
 * Evaluate a compiled puzzle against a board state.
 *
 * Each constraint resolves to one of three statuses via Kleene logic:
 *   - satisfied   the expression is definitely true
 *   - violated    the expression is definitely false
 *   - incomplete  not enough cells are filled to decide
 *
 * The puzzle is `valid` when nothing is violated, and `complete` when every cell
 * is filled and every constraint is satisfied.
 */

import type { CellId, Geometry } from "@/runtime/geometry.ts";
import { createGeometry } from "@/runtime/geometry.ts";
import { isCall, type EvalContext } from "@/runtime/expression.ts";
import { evalExpr } from "@/runtime/operators.ts";
import type { CompiledPuzzle } from "@/runtime/puzzle.ts";

/**
 * A constraint is "incomplete" rather than "violated" while any cell in its
 * footprint is still empty. But some incomplete constraints are already dead:
 * no assignment of the remaining empty cells can ever satisfy them (e.g. a
 * thermometer head too high to leave room for the rest of the climb, or a
 * cage target unreachable given the domain). Catching that early — before a
 * literal rule break exists — generalizes to every operator for free: this
 * just re-runs the existing evaluator over every possible completion of the
 * constraint's own empty cells and asks whether any of them avoid `false`.
 * No per-operator bounds logic; it falls out of the operators already being
 * pure functions over `valueOf`.
 *
 * Exhaustive, so it's capped — above the cap we make no claim (stay
 * "incomplete") rather than guess, consistent with never reporting a
 * violation we can't prove.
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
                return true; // malformed expressions are reported elsewhere, not here
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
    /** Cells belonging to at least one violated constraint. */
    violatedCells: ReadonlySet<CellId>;
    /** Cells whose entered value is outside the puzzle domain. */
    invalidCells: ReadonlySet<CellId>;
}

/** How the evaluator reads the board: entered value of a cell, or null. */
export type ValueLookup = (cell: CellId) => number | null;

export const lookupFromRecord = (
    values: Readonly<Record<CellId, number | null | undefined>>,
): ValueLookup => {
    return (cell) => {
        const v = values[cell];
        return v === undefined || v === null ? null : v;
    };
};

/** The expensive part: run one constraint's expression (plus the infeasibility search) against the board. */
const evaluateOneConstraint = (
    constraint: CompiledPuzzle["constraints"][number],
    ctx: EvalContext,
    lookup: ValueLookup,
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

    if (status === "incomplete" && isProvablyInfeasible(constraint.expr, constraint.cells, ctx, lookup)) {
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

/** The cheap part: board-wide bookkeeping (fill/domain/violated-cell sets) given already-decided per-constraint statuses. */
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

export const evaluate = (puzzle: CompiledPuzzle, lookup: ValueLookup): EvaluationResult => {
    const geometry = createGeometry(puzzle.geometry);
    const ctx: EvalContext = { geometry, regions: puzzle.regions, domain: puzzle.domain, valueOf: lookup };
    const constraints = puzzle.constraints.map((c) => evaluateOneConstraint(c, ctx, lookup));
    return finalize(puzzle, geometry, lookup, constraints);
};

/**
 * Re-evaluates only the constraints touching `changedCells`, reusing every other
 * constraint's status from `previous` — the fix for the per-keystroke cost of
 * re-running every constraint's expression (and infeasibility search) on every
 * edit, which `evaluate()` alone pays regardless of how localized the edit was.
 * Board-wide bookkeeping (fill/invalid/violated-cell sets) is still recomputed —
 * that part is a cheap linear pass, not the bottleneck — only the per-constraint
 * expression evaluation is skipped for unaffected constraints.
 */
export const evaluateIncremental = (
    puzzle: CompiledPuzzle,
    lookup: ValueLookup,
    previous: EvaluationResult,
    changedCells: Iterable<CellId>,
): EvaluationResult => {
    const geometry = createGeometry(puzzle.geometry);
    const affected = new Set(affectedConstraints(puzzle, changedCells));

    // Board-wide bookkeeping (filledCount/invalidCells) can change even for a cell
    // that belongs to no constraint at all, so it's always recomputed below; only
    // the expensive per-constraint expression evaluation is conditionally skipped.
    if (affected.size === 0) return finalize(puzzle, geometry, lookup, previous.constraints);

    const ctx: EvalContext = { geometry, regions: puzzle.regions, domain: puzzle.domain, valueOf: lookup };
    const constraints = puzzle.constraints.map((c, i) =>
        affected.has(c.id) ? evaluateOneConstraint(c, ctx, lookup) : previous.constraints[i],
    );
    return finalize(puzzle, geometry, lookup, constraints);
};

/**
 * Narrows an `allDifferent`/`distinct` violation down to the cells actually
 * sharing a duplicate value, instead of every cell the group spans — a 9-cell
 * row with one repeated digit should highlight the 2 offending cells, not all 9.
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
 * Constraints whose footprint includes any of the changed cells — the set that
 * needs re-checking after an edit, for callers that want incremental updates.
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
