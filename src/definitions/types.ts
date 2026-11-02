/**
 * A "definition" is a package for a puzzle author: a pure function that turns a few
 * parameters into primitive constraints (and optionally visual objects).
 *
 * Definitions are fully on top of the runtime. `compilePuzzle` gets the
 * registry as an argument and does not import it. So the runtime has no build
 * dependency on any specific variant. If you delete this whole folder, puzzles
 * written in primitive constraints still load and play.
 */

import type { CellId, Geometry } from "@/runtime/geometry.ts";
import type { Expr } from "@/runtime/expression.ts";
import type { VisualObject } from "@/runtime/puzzle.ts";

export interface CompileContext {
    geometry: Geometry;
    regions: Readonly<Record<string, readonly CellId[]>>;
    domain: readonly number[];
}

export interface EmittedConstraint {
    expr: Expr;
    label?: string;
}

export interface DefinitionOutput {
    constraints: readonly EmittedConstraint[];
    objects?: readonly VisualObject[];
}

/**
 * How the Visual tab lets an author place a definition. It lists the fields of its `params`
 * as a few kinds that a generic palette/form can render. The schema is optional. It is declared
 * with the definition (`thermometer.schema = {...}` next to the function). So a definition that
 * moves to another place, such as a shared variant, brings its builder support with it.
 * The schema is plain data only. A definition without a schema still works everywhere.
 * The palette does not offer it.
 */
export type AuthoringField =
    | { kind: "cell"; key: string; label: string }
    | { kind: "cells"; key: string; label: string; min: number; max?: number }
    | { kind: "number"; key: string; label: string; required: boolean }
    | { kind: "boolean"; key: string; label: string; default: boolean }
    | { kind: "numberList"; key: string; label: string };

export interface DefinitionSchema {
    label: string;
    fields: readonly AuthoringField[];
}

export type ConstraintDefinition = ((
    params: Readonly<Record<string, unknown>>,
    ctx: CompileContext,
) => DefinitionOutput | Error) & {
    /** Visual-builder metadata for this definition (see `DefinitionSchema`). */
    schema?: DefinitionSchema;
};

export type DefinitionRegistry = Readonly<Record<string, ConstraintDefinition>>;

// --- shared parameter helpers ----------------------------------------------

export const requireCellList = (
    params: Readonly<Record<string, unknown>>,
    key: string,
    ctx: CompileContext,
): CellId[] | Error => {
    const raw = params[key];
    if (!Array.isArray(raw) || raw.length === 0) {
        return new Error(`"${key}" must be a non-empty array of cell ids`);
    }
    const cells: CellId[] = [];
    for (const c of raw) {
        if (typeof c !== "string" || !ctx.geometry.has(c)) {
            return new Error(`"${key}" contains an invalid cell id: ${JSON.stringify(c)}`);
        }
        cells.push(c);
    }
    return cells;
};

export const requireCell = (
    params: Readonly<Record<string, unknown>>,
    key: string,
    ctx: CompileContext,
): CellId | Error => {
    const raw = params[key];
    if (typeof raw !== "string" || !ctx.geometry.has(raw)) {
        return new Error(`"${key}" must be a valid cell id`);
    }
    return raw;
};

export const requireNumber = (params: Readonly<Record<string, unknown>>, key: string): number | Error => {
    const raw = params[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return new Error(`"${key}" must be a number`);
    }
    return raw;
};
