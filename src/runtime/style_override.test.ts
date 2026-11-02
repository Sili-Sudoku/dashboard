import { describe, expect, it } from "vitest";

import { compilePuzzle } from "@/runtime/compile.ts";
import { definitions } from "@/definitions/index.ts";
import type { ConstraintSpec, PuzzleDefinition } from "@/runtime/puzzle.ts";

const puzzle = (constraint: ConstraintSpec): PuzzleDefinition => ({
    version: 1,
    metadata: { id: "style", title: "style" },
    geometry: { type: "grid", width: 4, height: 4 },
    domain: { values: [1, 2, 3, 4] },
    constraints: [constraint],
});

const thermo = { use: "thermometer", cells: ["r1c1", "r1c2", "r1c3"] };

const compile = (constraint: ConstraintSpec) => {
    const result = compilePuzzle(puzzle(constraint), definitions);
    if (result instanceof Error) throw result;
    return result;
};

describe("per-instance style override (#132)", () => {
    it("leaves a definition's own look alone when there is no override", () => {
        const [path, bulb] = compile(thermo).objects;
        expect(path?.style?.stroke).toBe("var(--thermo)");
        expect(bulb?.style?.fill).toBe("var(--thermo)");
    });

    it("`color` recolours strokes and fills, but doesn't invent a fill where there was none", () => {
        const [path, bulb] = compile({ ...thermo, color: "#2c7a4b" }).objects;
        expect(path?.style).toMatchObject({ stroke: "#2c7a4b", strokeWidth: 0.28, opacity: 0.55 });
        expect(path?.style?.fill).toBeUndefined();
        expect(bulb?.style).toMatchObject({ stroke: "#2c7a4b", fill: "#2c7a4b" });
    });

    it("`style` sets individual properties on every object, on top of `color`", () => {
        const [path, bulb] = compile({ ...thermo, color: "#2c7a4b", style: { opacity: 1, dashed: true } }).objects;
        expect(path?.style).toMatchObject({ stroke: "#2c7a4b", opacity: 1, dashed: true });
        expect(bulb?.style).toMatchObject({ fill: "#2c7a4b", opacity: 1, dashed: true });
    });

    it("keeps the object's constraint id, and is per instance", () => {
        const def = puzzle(thermo);
        const two = {
            ...def,
            constraints: [thermo, { ...thermo, cells: ["r2c1", "r2c2"], color: "#b8321f" }],
        };
        const compiled = compilePuzzle(two, definitions);
        if (compiled instanceof Error) throw compiled;
        const strokes = compiled.objects.filter((o) => o.kind === "path").map((o) => o.style?.stroke);
        expect(strokes).toEqual(["var(--thermo)", "#b8321f"]);
        expect(compiled.objects.every((o) => o.id)).toBe(true);
    });

    it("rejects a malformed override with a message that names the problem", () => {
        const failure = (c: ConstraintSpec) => {
            const r = compilePuzzle(puzzle(c), definitions);
            return r instanceof Error ? r.message : "";
        };
        expect(failure({ ...thermo, color: 5 })).toMatch(/"color" must be a color string/);
        expect(failure({ ...thermo, style: "red" })).toMatch(/"style" must be an object/);
        expect(failure({ ...thermo, style: { glow: 1 } })).toMatch(/unknown style property "glow"/);
        expect(failure({ ...thermo, style: { opacity: "half" } })).toMatch(/style "opacity" must be a number/);
    });
});
