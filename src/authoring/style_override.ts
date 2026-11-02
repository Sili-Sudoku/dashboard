/**
 * Reading and writing a placed constraint's own look (#132/#165): the `color` and `style` fields any
 * definition reference can carry (see `restyle` in compile.ts). The visual builder only edits the
 * three that mean something without knowing the definition: colour, dashed, opacity. Anything else
 * already in `style` (set in JSON) is left untouched.
 */

import { definitions } from "@/definitions/index.ts";
import { createGeometry } from "@/runtime/geometry.ts";
import { isDefinitionRef, type ConstraintSpec, type PuzzleDefinition } from "@/runtime/puzzle.ts";

export interface StyleOverride {
    color?: string;
    dashed?: boolean;
    opacity?: number;
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
    };
};

/** The spec with `patch` applied; a key set to `undefined` goes back to the definition's own look. */
export const withOverride = (spec: Ref, patch: Partial<Record<keyof StyleOverride, unknown>>): Ref => {
    const { color, style: _style, ...rest } = spec;
    void _style;
    const nextStyle: Record<string, unknown> = { ...styleOf(spec) };
    for (const key of ["dashed", "opacity"] as const) {
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
