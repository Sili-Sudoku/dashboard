/**
 * The constraint language.
 *
 * A constraint is a small S-expression encoded as JSON. The first element of an
 * array is an operator name; the rest are arguments (themselves expressions, or
 * bare strings used as cell ids / region selectors):
 *
 *   ["allDifferent", ["cells", "row:0"]]
 *   ["==", ["sum", ["cells", "cage:A"]], 15]
 *   ["<", ["value", "r1c1"], ["value", "r1c2"]]
 *   ["strictIncreasing", ["cells", ["r1c8", "r2c8", "r3c8"]]]
 *
 * The runtime evaluates any expression built from the operators in
 * `operators.ts`. It has no notion of "thermometer" or "killer" — those are
 * compositions produced by definitions (see `src/definitions`).
 *
 * Bare JSON scalars are literals: `5` is a number, `true` a boolean. A bare
 * string is only meaningful where an operator expects a cell id or selector
 * (the arguments of `value`, `cells`, `region`, `adjacent`), plus the special
 * token `"$"` which binds to the current value inside a `count` predicate.
 */

import type { CellId, Geometry } from "@/runtime/geometry.ts";

export type Expr = number | boolean | string | readonly Expr[];

/** A resolved value flowing through evaluation. */
export type Val =
    | { t: "num"; v: number }
    | { t: "bool"; v: boolean }
    | { t: "unknown" }
    | { t: "nums"; v: readonly (number | null)[] }
    | { t: "cells"; v: readonly CellId[] };

export const numVal = (v: number): Val => ({ t: "num", v });
export const boolVal = (v: boolean): Val => ({ t: "bool", v });
export const unknownVal: Val = { t: "unknown" };
export const numsVal = (v: readonly (number | null)[]): Val => ({ t: "nums", v });
export const cellsVal = (v: readonly CellId[]): Val => ({ t: "cells", v });

export interface EvalContext {
    geometry: Geometry;
    /** Puzzle-defined named regions, e.g. { "cage:A": ["r1c1", "r1c2"] }. */
    regions: Readonly<Record<string, readonly CellId[]>>;
    /** Allowed values for a cell (the puzzle's digit domain). */
    domain: readonly number[];
    /** Current board state: the entered value of a cell, or null if empty. */
    valueOf: (cell: CellId) => number | null;
    /** Lexical bindings, currently only "$" inside `count` predicates. */
    bindings?: Readonly<Record<string, number>>;
}

/** Kleene three-valued truth: true / false / unknown. */
export type Ternary = true | false | "unknown";

export class ExpressionError extends Error {
    readonly expr?: Expr;

    constructor(message: string, expr?: Expr) {
        super(message);
        this.name = "ExpressionError";
        this.expr = expr;
    }
}

export const isCall = (expr: Expr): expr is readonly Expr[] => Array.isArray(expr);

/**
 * Every cell id an expression can touch, resolved against the geometry and named
 * regions. Used for error highlighting and for deciding which constraints to
 * re-check after a cell changes.
 */
export const collectCells = (expr: Expr, ctx: EvalContext): CellId[] => {
    const out = new Set<CellId>();
    walk(expr, ctx, out);
    return [...out];
};

const walk = (expr: Expr, ctx: EvalContext, out: Set<CellId>): void => {
    if (!isCall(expr)) return;
    const [head, ...args] = expr;
    if (typeof head !== "string") {
        throw new ExpressionError("operator name must be a string", expr);
    }

    switch (head) {
        case "value":
        case "cell": {
            for (const c of resolveCellArgs(args, ctx)) out.add(c);
            return;
        }
        case "values":
        case "cells":
        case "region": {
            for (const c of resolveCellArgs(args, ctx)) out.add(c);
            return;
        }
        case "adjacent": {
            for (const a of args) {
                if (typeof a === "string") {
                    if (ctx.geometry.has(a)) out.add(a);
                } else {
                    walk(a, ctx, out);
                }
            }
            return;
        }
        default: {
            for (const a of args) {
                if (typeof a === "string") {
                    // A bare string outside a cell position: only "$" is legal,
                    // and it references no cell.
                    continue;
                }
                walk(a, ctx, out);
            }
        }
    }
};

/**
 * Resolve the argument list of a cell-shaped operator (`value`, `cells`, ...)
 * into concrete cell ids. Accepts:
 *   - a single bare string: a cell id ("r1c1") or selector ("row:0", "cage:A")
 *   - a bare array of strings: an explicit cell list
 *   - a nested expression evaluating to cells
 */
export const resolveCellArgs = (args: readonly Expr[], ctx: EvalContext): readonly CellId[] => {
    if (args.length === 1) {
        const only = args[0];
        if (typeof only === "string") return resolveSelector(only, ctx);
        if (isCall(only) && only.every((e) => typeof e === "string")) {
            return validateCells(only as readonly string[], ctx);
        }
    }
    // An explicit list passed as multiple string args: ["cells", "r1c1", "r1c2"]
    if (args.length > 1 && args.every((a) => typeof a === "string")) {
        return validateCells(args as readonly string[], ctx);
    }
    throw new ExpressionError("expected a cell id, selector, or cell list", args as unknown as Expr);
};

export const resolveSelector = (selector: string, ctx: EvalContext): readonly CellId[] => {
    if (ctx.geometry.has(selector)) return [selector];
    const geo = ctx.geometry.resolveRegion(selector);
    if (geo) return geo;
    const named = ctx.regions[selector];
    if (named) return named;
    throw new ExpressionError(`unknown cell or region selector: "${selector}"`);
};

const validateCells = (cells: readonly string[], ctx: EvalContext): readonly CellId[] => {
    for (const c of cells) {
        if (!ctx.geometry.has(c)) {
            throw new ExpressionError(`cell "${c}" is not part of the geometry`);
        }
    }
    return cells;
};
