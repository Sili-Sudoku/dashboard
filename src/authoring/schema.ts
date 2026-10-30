/**
 * Declarative UI schema for the visual puzzle builder (#54) — maps each
 * definition's ad-hoc param shape (see src/definitions/*.ts, which read
 * `params` by hand with no declared shape) onto a small set of field kinds a
 * generic palette/form can render. Kept separate from the definitions
 * themselves (same spirit as the registry in src/definitions/index.ts): a
 * definition still works with no visual-builder entry at all, it just won't
 * show up in the palette yet.
 */

import { isDefinitionRef, type ConstraintSpec } from "@/runtime/puzzle.ts";

export type AuthoringField =
    | { kind: "cell"; key: string; label: string }
    | { kind: "cells"; key: string; label: string; min: number; max?: number }
    | { kind: "number"; key: string; label: string; required: boolean }
    | { kind: "boolean"; key: string; label: string; default: boolean }
    | { kind: "numberList"; key: string; label: string };

export interface AuthoringSchema {
    /** Registry key — the "use" value written into the constraint. */
    name: string;
    label: string;
    fields: readonly AuthoringField[];
}

export type FieldValue = string | readonly string[] | number | readonly number[] | boolean | undefined;

export const AUTHORING_SCHEMAS: readonly AuthoringSchema[] = [
    {
        name: "sudoku",
        label: "Sudoku (rows/cols/boxes)",
        fields: [{ kind: "boolean", key: "boxes", label: "Include boxes", default: true }],
    },
    {
        name: "thermometer",
        label: "Thermometer",
        fields: [
            { kind: "cells", key: "cells", label: "Path, bulb first", min: 2 },
            { kind: "boolean", key: "strict", label: "Strictly increasing", default: true },
        ],
    },
    {
        name: "killer",
        label: "Killer cage",
        fields: [
            { kind: "cells", key: "cells", label: "Cage cells", min: 1 },
            { kind: "number", key: "sum", label: "Sum (optional)", required: false },
            { kind: "boolean", key: "distinct", label: "All different", default: true },
        ],
    },
    {
        name: "arrow",
        label: "Arrow",
        fields: [
            { kind: "cells", key: "bulb", label: "Bulb cell(s)", min: 1 },
            { kind: "cells", key: "cells", label: "Shaft path", min: 1 },
        ],
    },
    {
        name: "kropkiDifference",
        label: "Kropki (white dot)",
        fields: [
            { kind: "cells", key: "cells", label: "Two adjacent cells", min: 2, max: 2 },
            { kind: "number", key: "value", label: "Difference (default 1)", required: false },
        ],
    },
    {
        name: "kropkiRatio",
        label: "Kropki (black dot)",
        fields: [
            { kind: "cells", key: "cells", label: "Two adjacent cells", min: 2, max: 2 },
            { kind: "number", key: "value", label: "Ratio (default 2)", required: false },
        ],
    },
    { name: "odd", label: "Odd marker", fields: [{ kind: "cells", key: "cells", label: "Cells", min: 1 }] },
    { name: "even", label: "Even marker", fields: [{ kind: "cells", key: "cells", label: "Cells", min: 1 }] },
    { name: "antiknight", label: "Antiknight (global)", fields: [] },
    { name: "antiking", label: "Antiking (global)", fields: [] },
    { name: "nonconsecutive", label: "Nonconsecutive (global)", fields: [] },
    { name: "disjointgroups", label: "Disjoint groups (global)", fields: [] },
    { name: "palindrome", label: "Palindrome", fields: [{ kind: "cells", key: "cells", label: "Path", min: 2 }] },
    {
        name: "clone",
        label: "Clone region",
        fields: [
            { kind: "cells", key: "cells", label: "Region A", min: 1 },
            { kind: "cells", key: "cloneCells", label: "Region B (same size, same order)", min: 1 },
        ],
    },
    {
        name: "quadruple",
        label: "Quadruple",
        fields: [
            { kind: "cells", key: "cells", label: "Cells (usually 4 at a corner)", min: 1 },
            { kind: "numberList", key: "values", label: "Required values" },
        ],
    },
    { name: "minimum", label: "Minimum marker", fields: [{ kind: "cell", key: "cell", label: "Cell" }] },
    { name: "maximum", label: "Maximum marker", fields: [{ kind: "cell", key: "cell", label: "Cell" }] },
    {
        name: "xv",
        label: "XV",
        fields: [
            { kind: "cells", key: "cells", label: "Two adjacent cells", min: 2, max: 2 },
            { kind: "number", key: "target", label: "Target sum (10=X, 5=V)", required: true },
        ],
    },
    {
        name: "sandwich",
        label: "Sandwich sum",
        fields: [
            { kind: "cells", key: "cells", label: "Full line", min: 2 },
            { kind: "number", key: "sum", label: "Sum", required: true },
        ],
    },
    {
        name: "betweenline",
        label: "Between line",
        fields: [{ kind: "cells", key: "cells", label: "Path, endpoints first/last", min: 3 }],
    },
];

/** Only the fields a board click can fill — "number"/"boolean"/"numberList" are typed in, not clicked. */
export const cellFieldsOf = (schema: AuthoringSchema): AuthoringField[] =>
    schema.fields.filter((f) => f.kind === "cell" || f.kind === "cells");

export const isFieldComplete = (field: AuthoringField, value: FieldValue): boolean => {
    switch (field.kind) {
        case "cell":
            return typeof value === "string" && value.length > 0;
        case "cells": {
            const n = Array.isArray(value) ? value.length : 0;
            return n >= field.min && (field.max === undefined || n <= field.max);
        }
        case "number":
            return !field.required || (typeof value === "number" && Number.isFinite(value));
        case "boolean":
            return true;
        case "numberList":
            return Array.isArray(value) && value.length > 0;
    }
};

export const isSchemaComplete = (schema: AuthoringSchema, values: Readonly<Record<string, FieldValue>>): boolean =>
    schema.fields.every((f) => isFieldComplete(f, values[f.key]));

/** Omits a value equal to its own definition-side default, so a freshly-placed
 *  constraint's JSON stays minimal instead of echoing back every default. */
export const buildConstraintParams = (
    schema: AuthoringSchema,
    values: Readonly<Record<string, FieldValue>>,
): Record<string, unknown> => {
    const params: Record<string, unknown> = {};
    for (const field of schema.fields) {
        const v = values[field.key];
        switch (field.kind) {
            case "cell":
                if (typeof v === "string" && v) params[field.key] = v;
                break;
            case "cells":
                if (Array.isArray(v) && v.length > 0) params[field.key] = v;
                break;
            case "number":
                if (typeof v === "number" && Number.isFinite(v)) params[field.key] = v;
                break;
            case "boolean":
                if (typeof v === "boolean" && v !== field.default) params[field.key] = v;
                break;
            case "numberList":
                if (Array.isArray(v) && v.length > 0) params[field.key] = v;
                break;
        }
    }
    return params;
};

/** A one-line human label for an already-placed constraint, for the builder's list. */
export const summarizeConstraint = (spec: ConstraintSpec): string => {
    if (!isDefinitionRef(spec)) return "(raw expression)";
    const { use, ...rest } = spec;
    const schema = AUTHORING_SCHEMAS.find((s) => s.name === use);
    const label = schema?.label ?? use;
    const parts = Object.entries(rest).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : String(v)}`);
    return parts.length > 0 ? `${label} (${parts.join(", ")})` : label;
};
