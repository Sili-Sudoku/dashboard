/**
 * Compile a `PuzzleDefinition` into a `CompiledPuzzle`.
 *
 * Responsibilities:
 *   - build the geometry
 *   - validate givens / regions / objects against it
 *   - expand definition references (`{ use: "thermometer", ... }`) to primitives
 *     using the injected registry
 *   - statically check every primitive expression
 *   - resolve the cell footprint of each constraint
 *
 * Returns an `Error` (never throws) so callers can surface problems in the UI.
 */

import { createGeometry, type CellId, type Geometry } from "@/runtime/geometry.ts";
import { evaluate, lookupFromRecord } from "@/runtime/evaluate.ts";
import { collectCells, ExpressionError, type EvalContext, type Expr } from "@/runtime/expression.ts";
import { staticCheckExpr } from "@/runtime/operators.ts";
import {
    isDefinitionRef,
    PUZZLE_FORMAT_VERSION,
    type CompiledConstraint,
    type CompiledPuzzle,
    type ConstraintSpec,
    type PointRef,
    type PuzzleDefinition,
    type VisualObject,
} from "@/runtime/puzzle.ts";
import type { CompileContext, DefinitionRegistry } from "@/definitions/types.ts";

export const compilePuzzle = (
    def: PuzzleDefinition,
    registry: DefinitionRegistry = {},
): CompiledPuzzle | Error => {
    if (def.version !== PUZZLE_FORMAT_VERSION) {
        return new Error(`unsupported puzzle format version: ${String(def.version)}`);
    }
    if (!def.metadata?.id) return new Error("puzzle metadata.id is required");

    let geometry: Geometry;
    try {
        geometry = createGeometry(def.geometry);
    } catch (err) {
        return err instanceof Error ? err : new Error(String(err));
    }

    const domain = def.domain?.values ?? [];
    if (domain.length === 0) return new Error("puzzle domain.values must be non-empty");
    if (new Set(domain).size !== domain.length) return new Error("puzzle domain.values has duplicates");

    const builtinSelectors = new Set(geometry.regionSelectors);
    const regions: Record<string, readonly CellId[]> = {};
    for (const [name, cells] of Object.entries(def.regions ?? {})) {
        if (builtinSelectors.has(name)) {
            return new Error(`region "${name}" collides with a built-in selector of the same name`);
        }
        for (const c of cells) {
            if (!geometry.has(c)) return new Error(`region "${name}" references unknown cell "${c}"`);
        }
        regions[name] = cells;
    }

    const givens: Record<CellId, number> = {};
    for (const [cell, value] of Object.entries(def.givens ?? {})) {
        if (!geometry.has(cell)) return new Error(`given references unknown cell "${cell}"`);
        if (!domain.includes(value)) {
            return new Error(`given ${cell}=${value} is outside the puzzle domain`);
        }
        givens[cell] = value;
    }

    if (def.solution) {
        for (const [cell, value] of Object.entries(def.solution)) {
            if (!geometry.has(cell)) return new Error(`solution references unknown cell "${cell}"`);
            if (!domain.includes(value)) return new Error(`solution ${cell}=${value} is outside the domain`);
        }
    }

    const objectError = validateObjects(def.objects ?? [], geometry);
    if (objectError) return objectError;

    const compileCtx: CompileContext = { geometry, regions, domain };
    const staticCtx: EvalContext = {
        geometry,
        regions,
        domain,
        valueOf: () => null,
    };

    const constraints: CompiledConstraint[] = [];
    const objects: VisualObject[] = [...(def.objects ?? [])];
    const counters: Record<string, number> = {};

    for (const spec of def.constraints) {
        const expanded = expandSpec(spec, registry, compileCtx);
        if (expanded instanceof Error) return expanded;

        for (const emitted of expanded.constraints) {
            try {
                staticCheckExpr(emitted.expr);
            } catch (err) {
                return err instanceof ExpressionError
                    ? new Error(`constraint from "${expanded.source}": ${err.message}`)
                    : err instanceof Error
                      ? err
                      : new Error(String(err));
            }

            let cells: readonly CellId[];
            try {
                cells = collectCells(emitted.expr, staticCtx);
            } catch (err) {
                return err instanceof Error
                    ? new Error(`constraint from "${expanded.source}": ${err.message}`)
                    : new Error(String(err));
            }

            const n = (counters[expanded.source] = (counters[expanded.source] ?? 0) + 1);
            constraints.push({
                id: `${expanded.source}#${n}`,
                expr: emitted.expr,
                cells,
                source: expanded.source,
                label: emitted.label,
            });
        }

        if (expanded.objects) {
            const objectsError = validateObjects(expanded.objects, geometry);
            if (objectsError) return objectsError;
            objects.push(...expanded.objects);
        }
    }

    const compiled: CompiledPuzzle = {
        metadata: def.metadata,
        geometry: def.geometry,
        domain,
        regions,
        givens,
        objects,
        constraints,
        solution: def.solution,
        presentation: def.presentation ?? {},
    };

    if (def.solution) {
        const result = evaluate(compiled, lookupFromRecord(def.solution));
        const violated = result.constraints.filter((c) => c.status === "violated");
        if (violated.length > 0) {
            const ids = violated.map((c) => c.id).join(", ");
            return new Error(`declared solution violates constraint(s): ${ids}`);
        }
    }

    return compiled;
};

interface ExpandedSpec {
    source: string;
    constraints: readonly { expr: Expr; label?: string }[];
    objects?: readonly VisualObject[];
}

const expandSpec = (
    spec: ConstraintSpec,
    registry: DefinitionRegistry,
    ctx: CompileContext,
): ExpandedSpec | Error => {
    if (!isDefinitionRef(spec)) {
        return { source: "primitive", constraints: [{ expr: spec as Expr }] };
    }

    const definition = registry[spec.use];
    if (!definition) {
        return new Error(
            `unknown definition "${spec.use}" (available: ${Object.keys(registry).join(", ") || "none"})`,
        );
    }

    const { use, ...params } = spec;
    const out = definition(params, ctx);
    if (out instanceof Error) return out;
    return { source: use, constraints: out.constraints, objects: out.objects };
};

const visualCells = (obj: VisualObject): readonly CellId[] => {
    switch (obj.kind) {
        case "path":
        case "region":
        case "cage":
            return obj.cells;
        case "circle":
        case "rect":
        case "text":
            return pointRefCells(obj.at);
        case "line":
        case "polygon":
            return obj.points.flatMap(pointRefCells);
    }
};

const pointRefCells = (ref: PointRef): readonly CellId[] => {
    if (typeof ref === "string") return [ref];
    if ("cell" in ref) return [ref.cell];
    return [];
};

const validateObjects = (objects: readonly VisualObject[], geometry: Geometry): Error | undefined => {
    for (const obj of objects) {
        for (const cell of visualCells(obj)) {
            if (!geometry.has(cell)) {
                return new Error(`visual object "${obj.kind}" references unknown cell "${cell}"`);
            }
        }
    }
    return undefined;
};
