import { describe, expect, it } from "vitest";
import { compilePuzzle, solutionViolations } from "@/runtime/compile.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import type { DefinitionRegistry } from "@/definitions/types.ts";

const base: PuzzleDefinition = {
    version: 1,
    metadata: { id: "t", title: "t" },
    geometry: { type: "grid", width: 4, height: 4, boxWidth: 2, boxHeight: 2 },
    domain: { values: [1, 2, 3, 4] },
    constraints: [],
};

const fakeRegistry: DefinitionRegistry = {
    demo: (params) => ({
        constraints: [{ expr: ["allDifferent", ["cells", "row:0"]], label: String(params.tag ?? "demo") }],
        objects: [{ kind: "region", cells: ["r1c1"] }],
    }),
    broken: () => new Error("boom"),
};

describe("compilePuzzle", () => {
    it("compiles primitive constraints and resolves their cell footprint", () => {
        const result = compilePuzzle({
            ...base,
            constraints: [["allDifferent", ["cells", "row:0"]], ["<", ["value", "r1c1"], ["value", "r2c1"]]],
        });
        expect(result).not.toBeInstanceOf(Error);
        if (result instanceof Error) return;
        expect(result.constraints).toHaveLength(2);
        expect(result.constraints[0].source).toBe("primitive");
        expect(result.constraints[0].cells).toEqual(["r1c1", "r1c2", "r1c3", "r1c4"]);
        expect([...result.constraints[1].cells].sort()).toEqual(["r1c1", "r2c1"]);
    });

    it("expands definition references via the injected registry and merges objects", () => {
        const result = compilePuzzle(
            { ...base, constraints: [{ use: "demo", tag: "hello" }] },
            fakeRegistry,
        );
        if (result instanceof Error) throw result;
        expect(result.constraints[0].id).toBe("demo#1");
        expect(result.constraints[0].label).toBe("hello");
        expect(result.objects).toHaveLength(1);
    });

    it("returns an Error for an unknown definition", () => {
        const result = compilePuzzle({ ...base, constraints: [{ use: "missing" }] }, fakeRegistry);
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toMatch(/unknown definition "missing"/);
    });

    it("propagates a definition's own Error", () => {
        const result = compilePuzzle({ ...base, constraints: [{ use: "broken" }] }, fakeRegistry);
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toBe("boom");
    });

    it("rejects unknown operators, cells, givens out of domain, and bad versions", () => {
        expect(compilePuzzle({ ...base, constraints: [["frobnicate", 1]] })).toBeInstanceOf(Error);
        expect(compilePuzzle({ ...base, givens: { r9c9: 1 } })).toBeInstanceOf(Error);
        expect(compilePuzzle({ ...base, givens: { r1c1: 99 } })).toBeInstanceOf(Error);
        expect(compilePuzzle({ ...base, regions: { bad: ["r9c9"] } })).toBeInstanceOf(Error);
        expect(compilePuzzle({ ...base, version: 2 as unknown as 1 })).toBeInstanceOf(Error);
        expect(compilePuzzle({ ...base, domain: { values: [] } })).toBeInstanceOf(Error);
    });

    it("rejects a custom region name that collides with a built-in selector", () => {
        const result = compilePuzzle({ ...base, regions: { "row:0": ["r1c1"] } });
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toMatch(/collides with a built-in selector/);
    });

    it("rejects a custom region named \"all\"", () => {
        const result = compilePuzzle({ ...base, regions: { all: ["r1c1"] } });
        expect(result).toBeInstanceOf(Error);
    });

    it("validates visual object cell references", () => {
        const result = compilePuzzle({
            ...base,
            objects: [{ kind: "path", cells: ["r1c1", "r9c9"] }],
            constraints: [],
        });
        expect(result).toBeInstanceOf(Error);
    });

    it("rejects a declared solution that violates a constraint", () => {
        const result = compilePuzzle({
            ...base,
            constraints: [["allDifferent", ["cells", "row:0"]]],
            solution: { r1c1: 1, r1c2: 1, r1c3: 3, r1c4: 4 },
        });
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toMatch(/declared solution violates constraint/);
    });

    it("accepts a declared solution that satisfies every constraint", () => {
        const result = compilePuzzle({
            ...base,
            constraints: [["allDifferent", ["cells", "row:0"]]],
            solution: { r1c1: 1, r1c2: 2, r1c3: 3, r1c4: 4 },
        });
        expect(result).not.toBeInstanceOf(Error);
    });

    it("with validateSolution: false, compiles anyway and reports the violation via solutionViolations instead", () => {
        const result = compilePuzzle(
            {
                ...base,
                constraints: [["allDifferent", ["cells", "row:0"]]],
                solution: { r1c1: 1, r1c2: 1, r1c3: 3, r1c4: 4 },
            },
            {},
            { validateSolution: false },
        );
        expect(result).not.toBeInstanceOf(Error);
        expect([...solutionViolations(result as Exclude<typeof result, Error>)]).toEqual(["primitive#1"]);
    });

    it("solutionViolations is empty for a puzzle with no declared solution, or one that's satisfied", () => {
        const noSolution = compilePuzzle({ ...base, constraints: [["allDifferent", ["cells", "row:0"]]] });
        expect(solutionViolations(noSolution as Exclude<typeof noSolution, Error>).size).toBe(0);

        const satisfied = compilePuzzle({
            ...base,
            constraints: [["allDifferent", ["cells", "row:0"]]],
            solution: { r1c1: 1, r1c2: 2, r1c3: 3, r1c4: 4 },
        });
        expect(solutionViolations(satisfied as Exclude<typeof satisfied, Error>).size).toBe(0);
    });

    it("tags a constraint's visual objects with its own compiled id", () => {
        const result = compilePuzzle({
            ...base,
            constraints: [{ use: "demo" }],
        }, fakeRegistry);
        expect(result).not.toBeInstanceOf(Error);
        const objects = (result as Exclude<typeof result, Error>).objects;
        expect(objects).toEqual([{ kind: "region", cells: ["r1c1"], id: "demo#1" }]);
    });

    it("rejects fog.hidden referencing an unknown cell", () => {
        const result = compilePuzzle({
            ...base,
            solution: { r1c1: 1, r1c2: 2, r1c3: 3, r1c4: 4 },
            fog: { hidden: ["r9c9"] },
        });
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toMatch(/fog.hidden references unknown cell/);
    });

    it("rejects fog declared without a solution", () => {
        const result = compilePuzzle({ ...base, fog: { hidden: ["r1c1"] } });
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toMatch(/fog but has no solution/);
    });

    it("passes a valid fog declaration through to the compiled puzzle", () => {
        const result = compilePuzzle({
            ...base,
            solution: { r1c1: 1, r1c2: 2, r1c3: 3, r1c4: 4 },
            fog: { hidden: ["r1c2"] },
        });
        if (result instanceof Error) throw result;
        expect(result.fog).toEqual({ hidden: ["r1c2"] });
    });

    it("compiles with an empty registry when no definitions are referenced", () => {
        const result = compilePuzzle({ ...base, constraints: [["allDifferent", ["cells", "col:0"]]] }, {});
        expect(result).not.toBeInstanceOf(Error);
    });
});

describe("named rules", () => {
    it("takes the author's name as the constraint's source, grouping same-named rules", () => {
        const result = compilePuzzle({
            ...base,
            constraints: [
                { rule: ["<", ["value", "r1c1"], ["value", "r1c2"]], name: "Left smaller" },
                { rule: ["<", ["value", "r2c1"], ["value", "r2c2"]], name: " Left smaller " },
                { rule: ["allDifferent", ["cells", "row:0"]] },
            ],
        });
        if (result instanceof Error) throw result;
        expect(result.constraints.map((c) => [c.id, c.source])).toEqual([
            ["Left smaller#1", "Left smaller"],
            ["Left smaller#2", "Left smaller"],
            ["primitive#1", "primitive"],
        ]);
    });

    it("keeps commas out of the name, and still checks the expression", () => {
        const ok = compilePuzzle({ ...base, constraints: [{ rule: ["==", 1, 1], name: "a, b" }] });
        if (ok instanceof Error) throw ok;
        expect(ok.constraints[0]?.source).toBe("a  b");
        expect(compilePuzzle({ ...base, constraints: [{ rule: ["nope", 1], name: "x" }] })).toBeInstanceOf(Error);
    });
});

describe("pattern and image styles", () => {
    const withStyle = (style: Record<string, unknown>): PuzzleDefinition => ({
        ...base,
        constraints: [{ use: "demo", style }],
    });
    const defs = fakeRegistry;

    it("accepts a known pattern and safe image URLs", () => {
        for (const style of [{ pattern: "dots" }, { image: "https://x.test/a.png" }, { image: "data:image/png;base64,AA==" }, { image: "/a.png" }]) {
            expect(compilePuzzle(withStyle(style), defs)).not.toBeInstanceOf(Error);
        }
    });
    it("rejects an unknown pattern and unsafe image URLs", () => {
        for (const style of [{ pattern: "plaid" }, { image: "javascript:alert(1)" }, { image: "//evil.test/a.png" }, { image: "http://x.test/a.png" }]) {
            expect(compilePuzzle(withStyle(style), defs)).toBeInstanceOf(Error);
        }
    });
});
