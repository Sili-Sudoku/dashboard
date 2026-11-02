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
    type VisualStyle,
} from "@/runtime/puzzle.ts";
import type { CompileContext, DefinitionRegistry } from "@/definitions/types.ts";

export const compilePuzzle = (
    def: PuzzleDefinition,
    registry: DefinitionRegistry = {},
    options?: { validateSolution?: boolean },
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

    if (def.fog) {
        if (!def.solution) {
            return new Error("puzzle declares fog but has no solution (fog needs one to know what counts as solved)");
        }
        for (const cell of def.fog.hidden) {
            if (!geometry.has(cell)) return new Error(`fog.hidden references unknown cell "${cell}"`);
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

        // Collected so this spec's own objects (below) can be tagged with the
        // constraint id(s) they belong to — lets a caller that tolerates a
        // solution/constraint mismatch (see validateSolution below) still
        // point at exactly which shape on the board is the violator.
        const specConstraintIds: string[] = [];
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
            const id = `${expanded.source}#${n}`;
            specConstraintIds.push(id);
            constraints.push({
                id,
                expr: emitted.expr,
                cells,
                source: expanded.source,
                label: emitted.label,
            });
        }

        if (expanded.objects) {
            const objectsError = validateObjects(expanded.objects, geometry);
            if (objectsError) return objectsError;
            const restyled = restyle(expanded.objects, spec);
            if (restyled instanceof Error) return restyled;
            objects.push(...restyled.map((o) => (o.id ? o : { ...o, id: specConstraintIds.join(",") })));
        }
    }

    const compiled: CompiledPuzzle = {
        metadata: def.metadata,
        geometry: def.geometry,
        domain,
        regions,
        givens,
        fog: def.fog,
        objects,
        constraints,
        solution: def.solution,
        presentation: def.presentation ?? {},
    };

    if (def.solution && options?.validateSolution !== false) {
        const ids = [...solutionViolations(compiled)];
        if (ids.length > 0) {
            return new Error(`declared solution violates constraint(s): ${ids.join(", ")}`);
        }
    }

    return compiled;
};

/** Which compiled constraint ids the puzzle's own declared solution fails,
 *  if any — the same check `compilePuzzle` normally rejects on (see
 *  `validateSolution` above). Exposed separately so a tolerant caller (e.g.
 *  the Author page's visual builder, mid-placement) can still get a
 *  renderable puzzle and highlight just the offending constraint(s) instead
 *  of losing the whole preview to one bad placement. Empty if the puzzle has
 *  no declared solution. */
export const solutionViolations = (compiled: CompiledPuzzle): ReadonlySet<string> => {
    if (!compiled.solution) return new Set();
    const result = evaluate(compiled, lookupFromRecord(compiled.solution));
    return new Set(result.constraints.filter((c) => c.status === "violated").map((c) => c.id));
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

const STYLE_KEYS: Record<keyof VisualStyle, "string" | "number" | "boolean"> = {
    stroke: "string",
    fill: "string",
    strokeWidth: "number",
    dashed: "boolean",
    opacity: "number",
    z: "number",
};

/**
 * A constraint's own look, per instance (#132): `color` recolours everything the definition drew
 * (strokes, and fills that aren't empty), and `style` sets any individual style property on top.
 * Done here, once, so every definition gets it without knowing about it — the definition keeps
 * its default look; a puzzle that wants another (a whisper line in green, a renban in pastel)
 * just says so on the constraint.
 */
const restyle = (objects: readonly VisualObject[], spec: ConstraintSpec): readonly VisualObject[] | Error => {
    if (!isDefinitionRef(spec)) return objects;
    const { color, style } = spec as { color?: unknown; style?: unknown };
    if (color === undefined && style === undefined) return objects;

    if (color !== undefined && (typeof color !== "string" || color === "")) {
        return new Error(`"${spec.use}": "color" must be a colour string, e.g. "#2c7a4b" or "var(--cage)"`);
    }
    if (style !== undefined) {
        if (typeof style !== "object" || style === null || Array.isArray(style)) {
            return new Error(`"${spec.use}": "style" must be an object of style properties`);
        }
        for (const [key, value] of Object.entries(style)) {
            const expected = STYLE_KEYS[key as keyof VisualStyle];
            if (!expected) return new Error(`"${spec.use}": unknown style property "${key}"`);
            if (typeof value !== expected) return new Error(`"${spec.use}": style "${key}" must be a ${expected}`);
        }
    }

    return objects.map((o) => {
        const base = o.style ?? {};
        const recoloured: VisualStyle =
            typeof color === "string"
                ? {
                      ...base,
                      stroke: color,
                      ...(base.fill !== undefined && base.fill !== "none" ? { fill: color } : {}),
                  }
                : base;
        return { ...o, style: { ...recoloured, ...(style as VisualStyle | undefined) } } as VisualObject;
    });
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
