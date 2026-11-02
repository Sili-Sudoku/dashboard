/**
 * What the visual puzzle builder (#54) knows about each definition: a small set of field kinds a
 * generic palette/form can render. Each definition declares its own (`definition.schema`, see
 * src/definitions/types.ts), so adding a variant is one place; this module just gathers them
 * from a registry and holds the helpers that work on them.
 */

import type { AuthoringField, DefinitionRegistry, DefinitionSchema } from "@/definitions/types.ts";
import { definitions } from "@/definitions/index.ts";
import { isDefinitionRef, type ConstraintSpec } from "@/runtime/puzzle.ts";

export type { AuthoringField };

export interface AuthoringSchema extends DefinitionSchema {
    /** Registry key — the "use" value written into the constraint. */
    name: string;
}

export type FieldValue = string | readonly string[] | number | readonly number[] | boolean | undefined;

/** The builder schemas of every definition in `registry` that declares one, in registry order. */
export const authoringSchemasOf = (registry: DefinitionRegistry): AuthoringSchema[] =>
    Object.entries(registry).flatMap(([name, definition]) =>
        definition.schema ? [{ name, ...definition.schema }] : [],
    );

export const AUTHORING_SCHEMAS: readonly AuthoringSchema[] = authoringSchemasOf(definitions);

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
