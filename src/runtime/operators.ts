/**
 * The operator registry. It holds the complete vocabulary that the runtime understands.
 *
 * These are generic primitives: arithmetic, ordering, counting, grouping, logic, and adjacency.
 * Puzzle variants are built when you compose them.
 * A new variant does not add an operator here.
 */

import type { CellId } from "@/runtime/geometry.ts";
import {
    boolVal,
    cellsVal,
    ExpressionError,
    isCall,
    numsVal,
    numVal,
    resolveCellArgs,
    resolveSelector,
    unknownVal,
    type EvalContext,
    type Expr,
    type Ternary,
    type Val,
} from "@/runtime/expression.ts";

export type OperatorFn = (args: readonly Expr[], ctx: EvalContext) => Val;

export const evalExpr = (expr: Expr, ctx: EvalContext): Val => {
    if (typeof expr === "number") return numVal(expr);
    if (typeof expr === "boolean") return boolVal(expr);
    if (typeof expr === "string") {
        if (expr === "$") {
            const bound = ctx.bindings?.["$"];
            return bound === undefined ? unknownVal : numVal(bound);
        }
        throw new ExpressionError(`bare string "${expr}" is not a valid expression`, expr);
    }
    if (!isCall(expr) || expr.length === 0) {
        throw new ExpressionError("empty or malformed expression", expr);
    }

    const [head, ...args] = expr;
    if (typeof head !== "string") {
        throw new ExpressionError("operator name must be a string", expr);
    }
    const op = OPERATORS[head];
    if (!op) throw new ExpressionError(`unknown operator: "${head}"`, expr);
    return op(args, ctx);
};

/** Evaluate an expression that must be a predicate (bool / unknown). */
export const evalPredicate = (expr: Expr, ctx: EvalContext): Ternary => {
    const v = evalExpr(expr, ctx);
    if (v.t === "bool") return v.v;
    if (v.t === "unknown") return "unknown";
    throw new ExpressionError(`expected a boolean expression, got ${v.t}`, expr);
};

// --- value helpers -----------------------------------------------------------

const asScalar = (expr: Expr, ctx: EvalContext): number | "unknown" => {
    const v = evalExpr(expr, ctx);
    if (v.t === "num") return v.v;
    if (v.t === "unknown") return "unknown";
    throw new ExpressionError(`expected a number, got ${v.t}`, expr);
};

const asCells = (arg: Expr, ctx: EvalContext): readonly CellId[] => {
    if (typeof arg === "string") return resolveSelector(arg, ctx);
    const v = evalExpr(arg, ctx);
    if (v.t === "cells") return v.v;
    throw new ExpressionError(`expected cells, got ${v.t}`, arg);
};

/** Convert an argument to a list of (number | null), from cells or from a num list. */
const asNums = (arg: Expr, ctx: EvalContext): readonly (number | null)[] => {
    if (typeof arg === "string") {
        return resolveSelector(arg, ctx).map((c) => ctx.valueOf(c));
    }
    const v = evalExpr(arg, ctx);
    if (v.t === "nums") return v.v;
    if (v.t === "cells") return v.v.map((c) => ctx.valueOf(c));
    if (v.t === "num") return [v.v];
    if (v.t === "unknown") return [null];
    throw new ExpressionError(`expected a numeric sequence, got ${v.t}`, arg);
};

const kleeneAnd = (values: Ternary[]): Ternary => {
    if (values.includes(false)) return false;
    if (values.includes("unknown")) return "unknown";
    return true;
};

const kleeneOr = (values: Ternary[]): Ternary => {
    if (values.includes(true)) return true;
    if (values.includes("unknown")) return "unknown";
    return false;
};

const ternaryVal = (t: Ternary): Val => (t === "unknown" ? unknownVal : boolVal(t));

const expectArgs = (name: string, args: readonly Expr[], n: number): void => {
    if (args.length !== n) {
        throw new ExpressionError(`${name} expects ${n} argument(s), got ${args.length}`);
    }
};

// --- ordering helpers ------------------------------------------------------

const orderCheck = (
    seq: readonly (number | null)[],
    ok: (a: number, b: number) => boolean,
): Ternary => {
    const results: Ternary[] = [];
    for (let i = 0; i + 1 < seq.length; i++) {
        const a = seq[i];
        const b = seq[i + 1];
        if (a === null || b === null) {
            results.push("unknown");
            continue;
        }
        results.push(ok(a, b));
    }
    return kleeneAnd(results);
};

// --- registry --------------------------------------------------------------

export const OPERATORS: Readonly<Record<string, OperatorFn>> = {
    // Grouping / references -------------------------------------------------
    cells: (args, ctx) => cellsVal(resolveCellArgs(args, ctx)),
    region: (args, ctx) => cellsVal(resolveCellArgs(args, ctx)),

    value: (args, ctx) => {
        const cells = resolveCellArgs(args, ctx);
        if (cells.length !== 1) {
            throw new ExpressionError(`value expects exactly one cell, got ${cells.length}`);
        }
        const v = ctx.valueOf(cells[0]);
        return v === null ? unknownVal : numVal(v);
    },

    values: (args, ctx) => numsVal(resolveCellArgs(args, ctx).map((c) => ctx.valueOf(c))),

    list: (args, ctx) =>
        numsVal(
            args.map((a) => {
                const s = asScalar(a, ctx);
                return s === "unknown" ? null : s;
            }),
        ),

    // Arithmetic ---------------------------------------------------------------
    sum: (args, ctx) => {
        expectArgs("sum", args, 1);
        const nums = asNums(args[0], ctx);
        if (nums.some((n) => n === null)) return unknownVal;
        return numVal(nums.reduce<number>((acc, n) => acc + (n as number), 0));
    },

    "+": (args, ctx) => arithmetic("+", args, ctx, (xs) => xs.reduce((a, b) => a + b, 0)),
    "*": (args, ctx) => arithmetic("*", args, ctx, (xs) => xs.reduce((a, b) => a * b, 1)),
    "-": (args, ctx) => {
        expectArgs("-", args, 2);
        return arithmetic("-", args, ctx, ([a, b]) => a - b);
    },

    // Counting ---------------------------------------------------------------
    count: (args, ctx) => {
        expectArgs("count", args, 2);
        const cells = asCells(args[0], ctx);
        const predicate = args[1];
        const perCell: Ternary[] = cells.map((cell) => {
            const bound = ctx.valueOf(cell);
            const inner: EvalContext = {
                ...ctx,
                bindings: { ...ctx.bindings, ...(bound === null ? {} : { $: bound }) },
            };
            return evalPredicate(predicate, inner);
        });
        const definite = perCell.filter((t) => t === true).length;
        const possible = definite + perCell.filter((t) => t === "unknown").length;
        return definite === possible ? numVal(definite) : unknownVal;
    },

    countValue: (args, ctx) => {
        expectArgs("countValue", args, 2);
        const cells = asCells(args[0], ctx);
        const target = asScalar(args[1], ctx);
        if (target === "unknown") return unknownVal;
        let definite = 0;
        let unknowns = 0;
        for (const cell of cells) {
            const v = ctx.valueOf(cell);
            if (v === null) unknowns++;
            else if (v === target) definite++;
        }
        return unknowns === 0 ? numVal(definite) : unknownVal;
    },

    // Grouping predicates --------------------------------------------------
    allDifferent: (args, ctx) => {
        expectArgs("allDifferent", args, 1);
        const nums = asNums(args[0], ctx);
        const seen = new Set<number>();
        let hasEmpty = false;
        for (const n of nums) {
            if (n === null) {
                hasEmpty = true;
                continue;
            }
            if (seen.has(n)) return boolVal(false);
            seen.add(n);
        }
        return hasEmpty ? unknownVal : boolVal(true);
    },
    distinct: (args, ctx) => OPERATORS.allDifferent(args, ctx),

    // Ordering -------------------------------------------------------------
    strictIncreasing: (args, ctx) => {
        expectArgs("strictIncreasing", args, 1);
        return ternaryVal(orderCheck(asNums(args[0], ctx), (a, b) => a < b));
    },
    strictDecreasing: (args, ctx) => {
        expectArgs("strictDecreasing", args, 1);
        return ternaryVal(orderCheck(asNums(args[0], ctx), (a, b) => a > b));
    },
    increasing: (args, ctx) => {
        expectArgs("increasing", args, 1);
        return ternaryVal(orderCheck(asNums(args[0], ctx), (a, b) => a <= b));
    },
    decreasing: (args, ctx) => {
        expectArgs("decreasing", args, 1);
        return ternaryVal(orderCheck(asNums(args[0], ctx), (a, b) => a >= b));
    },

    // Comparison ---------------------------------------------------------------
    "==": (args, ctx) => compare("==", args, ctx, (a, b) => a === b),
    "!=": (args, ctx) => compare("!=", args, ctx, (a, b) => a !== b),
    "<": (args, ctx) => compare("<", args, ctx, (a, b) => a < b),
    "<=": (args, ctx) => compare("<=", args, ctx, (a, b) => a <= b),
    ">": (args, ctx) => compare(">", args, ctx, (a, b) => a > b),
    ">=": (args, ctx) => compare(">=", args, ctx, (a, b) => a >= b),

    // Logic ------------------------------------------------------------------
    and: (args, ctx) => ternaryVal(kleeneAnd(args.map((a) => evalPredicate(a, ctx)))),
    or: (args, ctx) => ternaryVal(kleeneOr(args.map((a) => evalPredicate(a, ctx)))),
    not: (args, ctx) => {
        expectArgs("not", args, 1);
        const t = evalPredicate(args[0], ctx);
        return ternaryVal(t === "unknown" ? "unknown" : !t);
    },
    implies: (args, ctx) => {
        expectArgs("implies", args, 2);
        const a = evalPredicate(args[0], ctx);
        const b = evalPredicate(args[1], ctx);
        return ternaryVal(kleeneOr([a === "unknown" ? "unknown" : !a, b]));
    },

    // Geometry ------------------------------------------------------------------
    adjacent: (args, ctx) => {
        expectArgs("adjacent", args, 2);
        const [a, b] = args;
        if (typeof a !== "string" || typeof b !== "string") {
            throw new ExpressionError("adjacent expects two cell ids");
        }
        return boolVal(ctx.geometry.adjacent(a, b));
    },
};

const arithmetic = (
    name: string,
    args: readonly Expr[],
    ctx: EvalContext,
    combine: (xs: number[]) => number,
): Val => {
    if (args.length === 0) throw new ExpressionError(`${name} expects at least one argument`);
    const scalars = args.map((a) => asScalar(a, ctx));
    if (scalars.some((s) => s === "unknown")) return unknownVal;
    return numVal(combine(scalars as number[]));
};

const compare = (
    name: string,
    args: readonly Expr[],
    ctx: EvalContext,
    op: (a: number, b: number) => boolean,
): Val => {
    expectArgs(name, args, 2);
    const a = asScalar(args[0], ctx);
    const b = asScalar(args[1], ctx);
    if (a === "unknown" || b === "unknown") return unknownVal;
    return boolVal(op(a, b));
};

export const operatorNames = (): readonly string[] => Object.keys(OPERATORS);

/**
 * Structural validation without a board state.
 * Each call head must be a known operator.
 * Throws `ExpressionError` on the first problem.
 */
export const staticCheckExpr = (expr: Expr): void => {
    if (typeof expr === "number" || typeof expr === "boolean" || typeof expr === "string") return;
    if (!isCall(expr) || expr.length === 0) {
        throw new ExpressionError("empty or malformed expression", expr);
    }
    const [head, ...args] = expr;
    if (typeof head !== "string") {
        throw new ExpressionError("operator name must be a string", expr);
    }
    if (!OPERATORS[head]) throw new ExpressionError(`unknown operator: "${head}"`, expr);
    for (const arg of args) {
        if (Array.isArray(arg)) {
            // A bare cell list such as ["r1c1","r1c2"] is data. It is not a call.
            if (arg.every((e) => typeof e === "string")) continue;
            staticCheckExpr(arg);
        }
    }
};
