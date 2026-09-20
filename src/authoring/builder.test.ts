import { describe, expect, it } from "vitest";
import { PuzzleBuilder } from "@/authoring/builder.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate, lookupFromRecord } from "@/runtime/evaluate.ts";
import { parsePuzzle } from "@/runtime/serialization.ts";
import { definitions } from "@/definitions/index.ts";

describe("PuzzleBuilder", () => {
    it("builds a valid artifact that compiles, and 'publishes' as plain JSON", () => {
        const artifact = PuzzleBuilder.create("built", "Built by the builder")
            .describe({ author: "test", difficulty: "trivial" })
            .grid(4, 4, { boxWidth: 2, boxHeight: 2 })
            .domain([1, 2, 3, 4])
            .givensFromRows(["1...", "..1.", ".1..", "...1"])
            .solutionFromRows(["1234", "3412", "2143", "4321"])
            .use("sudoku")
            .use("thermometer", { cells: ["r1c1", "r2c1"] })
            .visual({ kind: "text", at: "r4c4", text: "★" })
            .build();

        expect(parsePuzzle(JSON.parse(JSON.stringify(artifact)))).not.toBeInstanceOf(Error);

        const compiled = compilePuzzle(artifact, definitions);
        if (compiled instanceof Error) throw compiled;

        expect(new Set(compiled.constraints.map((c) => c.source))).toEqual(new Set(["sudoku", "thermometer"]));
        expect(compiled.objects.some((o) => o.kind === "text")).toBe(true);

        const result = evaluate(compiled, lookupFromRecord(artifact.solution ?? {}));
        expect(result.complete).toBe(true);
    });

    it("supports hand-written primitive constraints with no definitions", () => {
        const artifact = PuzzleBuilder.create("prim", "Primitive")
            .grid(4, 4, { boxWidth: 2, boxHeight: 2 })
            .domain([1, 2, 3, 4])
            .constraint(["allDifferent", ["cells", "row:0"]])
            .build();

        expect(compilePuzzle(artifact, {})).not.toBeInstanceOf(Error);
    });
});
