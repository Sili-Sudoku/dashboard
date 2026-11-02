/**
 * Read and write the own look of a placed constraint (#132/#165): the `color` and `style` fields that any
 * definition reference can carry (see `restyle` in compile.ts). The visual builder edits only the
 * three fields that have meaning without knowledge of the definition: colour, dashed, opacity.
 * It does not change anything else already in `style` (set in JSON).
 */

import { definitions } from "@/definitions/index.ts";
import { createGeometry } from "@/runtime/geometry.ts";
import { isDefinitionRef, PATTERNS, type ConstraintSpec, type PatternName, type PuzzleDefinition } from "@/runtime/puzzle.ts";

export interface StyleOverride {
    color?: string;
    dashed?: boolean;
    opacity?: number;
    pattern?: PatternName;
    /** A picture that fills the shape: a data: URL when uploaded in the builder. Excludes `pattern`. */
    image?: string;
}

type Ref = { use: string; [key: string]: unknown };

const styleOf = (spec: Ref): Record<string, unknown> =>
    typeof spec.style === "object" && spec.style !== null && !Array.isArray(spec.style)
        ? (spec.style as Record<string, unknown>)
        : {};

export const readOverride = (spec: ConstraintSpec): StyleOverride => {
    if (!isDefinitionRef(spec)) return {};
    const style = styleOf(spec);
    return {
        color: typeof spec.color === "string" ? spec.color : undefined,
        dashed: typeof style.dashed === "boolean" ? style.dashed : undefined,
        opacity: typeof style.opacity === "number" ? style.opacity : undefined,
        pattern: PATTERNS.find((p) => p === style.pattern),
        image: typeof style.image === "string" ? style.image : undefined,
    };
};

/** The spec with `patch` applied. A key set to `undefined` goes back to the look of the definition. */
export const withOverride = (spec: Ref, patch: Partial<Record<keyof StyleOverride, unknown>>): Ref => {
    const { color, style: _style, ...rest } = spec;
    void _style;
    const nextStyle: Record<string, unknown> = { ...styleOf(spec) };
    // A pattern and a picture both replace the fill, so a choice of one drops the other.
    const exclusive = patch.pattern !== undefined ? "image" : patch.image !== undefined ? "pattern" : undefined;
    if (exclusive) delete nextStyle[exclusive];
    for (const key of ["dashed", "opacity", "pattern", "image"] as const) {
        if (!(key in patch)) continue;
        if (patch[key] === undefined) delete nextStyle[key];
        else nextStyle[key] = patch[key];
    }
    const nextColor = "color" in patch ? patch.color : color;
    return {
        ...rest,
        ...(nextColor !== undefined ? { color: nextColor } : {}),
        ...(Object.keys(nextStyle).length > 0 ? { style: nextStyle } : {}),
    };
};

/** True when a placed constraint draws something on the board, i.e. when a colour or opacity means anything. */
export const drawsObjects = (spec: ConstraintSpec, def: PuzzleDefinition): boolean => {
    if (!isDefinitionRef(spec)) return false;
    const definition = definitions[spec.use];
    if (!definition) return false;
    try {
        const { use: _use, ...params } = spec;
        void _use;
        const out = definition(params, {
            geometry: createGeometry(def.geometry),
            regions: def.regions ?? {},
            domain: def.domain.values,
        });
        return !(out instanceof Error) && (out.objects?.length ?? 0) > 0;
    } catch {
        return false;
    }
};
