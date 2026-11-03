/**
 * Compile a `PuzzleDefinition` into a `CompiledPuzzle`.
 *
 * Tasks:
 *   - build the geometry
 *   - validate givens, regions and objects against it
 *   - expand definition references (`{ use: "thermometer", ... }`) to primitives
 *     with the injected registry
 *   - check every primitive expression statically
 *   - resolve the cell footprint of each constraint
 *
 * It returns an `Error` and never throws. So callers can show problems in the UI.
 */

import { createGeometry, type CellId, type Geometry } from "@/runtime/geometry.ts";
import { evaluate, lookupFromRecord } from "@/runtime/evaluate.ts";
import { collectCells, ExpressionError, type EvalContext, type Expr } from "@/runtime/expression.ts";
import { staticCheckExpr } from "@/runtime/operators.ts";
import {
    isDefinitionRef,
    isNamedRule,
    PUZZLE_FORMAT_VERSION,
    type CompiledConstraint,
    objectIds,
    PATTERNS,
    type CompiledRule,
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
            return new Error(`region "${name}" has the same name as a built-in selector`);
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
            return new Error(
                "puzzle declares fog but has no solution. Fog needs a solution to know when the puzzle is solved",
            );
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

        // Collected so the objects of this spec (below) get the ids of their constraints.
        // A caller can tolerate a solution/constraint mismatch (see validateSolution below).
        // Then the caller can still show which shape on the board is the violator.
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

    const rules = compileRules(def, geometry, regions, staticCtx, constraints, objects);
    if (rules instanceof Error) return rules;

    const compiled: CompiledPuzzle = {
        metadata: def.metadata,
        geometry: def.geometry,
        domain,
        regions,
        givens,
        fog: def.fog,
        rules,
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

/** The ids of the compiled constraints that the declared solution of the puzzle fails, if any.
 *  This is the same check that `compilePuzzle` normally rejects on (see `validateSolution` above).
 *  It is a separate export for a tolerant caller (for example the visual builder on the Author page,
 *  during placement). The caller can then get a puzzle to render and highlight only the failing
 *  constraints. The whole preview does not fail because of one bad placement.
 *  The result is empty if the puzzle has no declared solution. */
export const solutionViolations = (compiled: CompiledPuzzle): ReadonlySet<string> => {
    if (!compiled.solution) return new Set();
    const result = evaluate(compiled, lookupFromRecord(compiled.solution));
    return new Set(result.constraints.filter((c) => c.status === "violated").map((c) => c.id));
};

/**
 * Resolves the rules.
 * `enable` and `disable` go directly into the constraints they name.
 * "Enforce C only while W" is `implies(W, C)`. "Enforce C except while W" is `or(W, C)`.
 * So the evaluator and the solver do not need to know about rules.
 * This function changes `constraints` in place.
 */
const compileRules = (
    def: PuzzleDefinition,
    geometry: Geometry,
    regions: Readonly<Record<string, readonly CellId[]>>,
    staticCtx: EvalContext,
    constraints: CompiledConstraint[],
    objects: readonly VisualObject[],
): CompiledRule[] | Error => {
    const out: CompiledRule[] = [];
    for (const [i, rule] of (def.rules ?? []).entries()) {
        const id = rule.id ?? `rule#${i + 1}`;
        const fail = (message: string) => new Error(`rule "${id}": ${message}`);
        let cells: readonly CellId[];
        try {
            staticCheckExpr(rule.when);
            cells = collectCells(rule.when, staticCtx);
        } catch (err) {
            return fail(err instanceof Error ? err.message : String(err));
        }

        const resolveCells = (effect: string, refs: readonly string[] | undefined): CellId[] | Error => {
            const found: CellId[] = [];
            for (const ref of refs ?? []) {
                const group = geometry.has(ref) ? [ref] : (regions[ref] ?? geometry.resolveRegion(ref));
                if (!group) return fail(`${effect}: "${ref}" is neither a cell nor a region`);
                found.push(...group);
            }
            return found;
        };
        const reveal = resolveCells("reveal", rule.then.reveal);
        if (reveal instanceof Error) return reveal;
        const appear = resolveCells("appear", rule.then.appear);
        if (appear instanceof Error) return appear;
        for (const [effect, refs] of [
            ["show", rule.then.show],
            ["hide", rule.then.hide],
        ] as const) {
            for (const ref of refs ?? []) {
                if (!objects.some((o) => objectIds(o).includes(ref)))
                    return fail(`${effect}: no visual object has the id "${ref}"`);
            }
        }
        for (const [effect, refs] of [
            ["enable", rule.then.enable],
            ["disable", rule.then.disable],
        ] as const) {
            for (const ref of refs ?? []) {
                const hits = constraints.filter((c) => c.id === ref || c.source === ref);
                if (hits.length === 0) return fail(`${effect}: no constraint has the id or name "${ref}"`);
                for (const c of hits) {
                    const index = constraints.indexOf(c);
                    constraints[index] = {
                        ...c,
                        expr: [effect === "enable" ? "implies" : "or", rule.when, c.expr],
                        // The footprint controls incremental re-evaluation. It must include what `when` reads.
                        cells: [...new Set([...c.cells, ...cells])],
                    };
                }
            }
        }

        out.push({
            id,
            when: rule.when,
            cells,
            reveal,
            appear,
            show: rule.then.show ?? [],
            hide: rule.then.hide ?? [],
        });
    }
    return out;
};

interface ExpandedSpec {
    source: string;
    constraints: readonly { expr: Expr; label?: string }[];
    objects?: readonly VisualObject[];
}

const expandSpec = (spec: ConstraintSpec, registry: DefinitionRegistry, ctx: CompileContext): ExpandedSpec | Error => {
    if (isNamedRule(spec)) {
        // A comma separates object ids, so a name cannot contain one.
        const name = (spec.name ?? "").trim().replace(/,/g, " ");
        return { source: name || "primitive", constraints: [{ expr: spec.rule }] };
    }
    if (!isDefinitionRef(spec)) {
        return { source: "primitive", constraints: [{ expr: spec }] };
    }

    const definition = registry[spec.use];
    if (!definition) {
        return new Error(`unknown definition "${spec.use}" (available: ${Object.keys(registry).join(", ") || "none"})`);
    }

    const { use, ...params } = spec;
    const out = definition(params, ctx);
    if (out instanceof Error) return out;
    return { source: use, constraints: out.constraints, objects: out.objects };
};

const STYLE_KEYS: Record<keyof VisualStyle, "string" | "number" | "boolean"> = {
    pattern: "string",
    image: "string",
    stroke: "string",
    fill: "string",
    strokeWidth: "number",
    dashed: "boolean",
    opacity: "number",
    z: "number",
};

/**
 * The look of one constraint instance.
 * `color` changes the color of everything the definition drew (strokes, and fills that are not empty).
 * `style` sets single style properties on top of that.
 * This code does it once, so every definition gets it and does not need to know about it.
 * The definition keeps its default look.
 * A puzzle that needs another look (a whisper line in green, a renban in pastel) sets it on the constraint.
 */
const restyle = (objects: readonly VisualObject[], spec: ConstraintSpec): readonly VisualObject[] | Error => {
    if (!isDefinitionRef(spec)) return objects;
    const { color, style } = spec as { color?: unknown; style?: unknown };
    if (color === undefined && style === undefined) return objects;

    if (color !== undefined && (typeof color !== "string" || !isSafeColor(color))) {
        return new Error(`"${spec.use}": "color" must be a color string, for example "#2c7a4b" or "var(--cage)"`);
    }
    if (style !== undefined) {
        if (typeof style !== "object" || style === null || Array.isArray(style)) {
            return new Error(`"${spec.use}": "style" must be an object of style properties`);
        }
        for (const [key, value] of Object.entries(style)) {
            const expected = STYLE_KEYS[key as keyof VisualStyle];
            if (!expected) return new Error(`"${spec.use}": unknown style property "${key}"`);
            if (typeof value !== expected) return new Error(`"${spec.use}": style "${key}" must be a ${expected}`);
            if (key === "pattern" && !(PATTERNS as readonly string[]).includes(value as string)) {
                return new Error(`"${spec.use}": style "pattern" must be one of ${PATTERNS.join(", ")}`);
            }
            if (key === "image" && !isSafeImageUrl(value as string)) {
                return new Error(`"${spec.use}": style "image" must be a data:image/ URL or a site-relative URL`);
            }
            if ((key === "stroke" || key === "fill") && !isSafeColor(value as string)) {
                return new Error(
                    `"${spec.use}": style "${key}" must be a color, for example "#2c7a4b" or "var(--cage)"`,
                );
            }
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
        return { ...o, style: { ...recoloured, ...(style as VisualStyle | undefined) } };
    });
};

/**
 * A picture is an inline data: URL or a path on this site. It is never a URL of another site: a shared puzzle
 * would then tell that site who opens the puzzle (a tracking pixel). It is never a script or a file: URL.
 * An SVG in an image is safe: the browser runs no script in it and loads nothing from it.
 * The path form refuses a backslash and white space or control characters. A browser removes or converts them,
 * so "/\\host/x" or "/<tab>/host/x" would mean "//host/x", a URL of another site.
 */
export const isSafeImageUrl = (url: string): boolean =>
    /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(url) ||
    (/^\/(?![/\\])\S*$/.test(url) &&
        !url.includes("\\") &&
        [...url].every((c) => c.charCodeAt(0) > 31 && c !== "\x7f"));

/**
 * A color for a stroke or a fill: a hex value, a color name, a color function, or a theme variable.
 * It has no `url(...)`. A paint can point to a file on another site, and the browser then loads it.
 */
export const isSafeColor = (color: string): boolean =>
    /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|var\(--[\w-]+(,[^()]*)?\))$/i.test(
        color.trim(),
    );

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
        const { image, pattern } = obj.style ?? {};
        if (image !== undefined && (typeof image !== "string" || !isSafeImageUrl(image))) {
            return new Error(
                `visual object "${obj.kind}": style "image" must be a data:image/ URL or a site-relative URL`,
            );
        }
        for (const key of ["stroke", "fill"] as const) {
            const value = obj.style?.[key];
            if (value !== undefined && (typeof value !== "string" || !isSafeColor(value))) {
                return new Error(`visual object "${obj.kind}": style "${key}" must be a color, for example "#2c7a4b"`);
            }
        }
        if (pattern !== undefined && !(PATTERNS as readonly string[]).includes(pattern)) {
            return new Error(`visual object "${obj.kind}": style "pattern" must be one of ${PATTERNS.join(", ")}`);
        }
        for (const cell of visualCells(obj)) {
            if (!geometry.has(cell)) {
                return new Error(`visual object "${obj.kind}" references unknown cell "${cell}"`);
            }
        }
    }
    return undefined;
};
