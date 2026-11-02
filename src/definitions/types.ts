/**
 * A "definition" is a puzzle-author package: a pure function that turns a few
 * parameters into primitive constraints (and optionally visual objects).
 *
 * Definitions live entirely on top of the runtime. `compilePuzzle` receives the
 * registry as an argument rather than importing it, so the runtime has no build
 * dependency on any specific variant. Delete this whole folder and puzzles
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
 * How the Visual tab lets an author place a definition: the fields of its `params` as a few
 * kinds a generic palette/form can render. Optional and declared with the definition itself
 * (`thermometer.schema = {...}` beside the function), so a definition that travels — a shared
 * variant — brings its builder support with it. Plain data, nothing more. A definition without
 * one still works everywhere; it just isn't offered in the palette.
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
