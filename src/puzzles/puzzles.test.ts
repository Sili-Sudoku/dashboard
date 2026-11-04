import { describe, expect, it } from "vitest";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate, lookupFromRecord } from "@/runtime/evaluate.ts";
import { parsePuzzle } from "@/runtime/serialization.ts";
import { definitions } from "@/definitions/index.ts";
import { listPuzzles } from "@/puzzles/index.ts";
import { firstPuzzle } from "@/puzzles/first_puzzle.ts";
import { solve } from "@/runtime/solver.ts";
import { miniSudoku } from "@/puzzles/mini_sudoku.ts";
import { compilePuzzle as compile } from "@/runtime/compile.ts";

describe.each(listPuzzles())("built-in puzzle: $metadata.id", (def) => {
    it("passes structural validation", () => {
        expect(parsePuzzle(def)).not.toBeInstanceOf(Error);
    });

    it("compiles against the definition registry", () => {
        expect(compilePuzzle(def, definitions)).not.toBeInstanceOf(Error);
    });

    it("ships a solution that is consistent with its givens", () => {
        expect(def.solution).toBeDefined();
        for (const [cell, value] of Object.entries(def.givens ?? {})) {
            expect(def.solution?.[cell]).toBe(value);
        }
    });

    it("the solution satisfies every constraint and completes the puzzle", () => {
        const compiled = compilePuzzle(def, definitions);
        if (compiled instanceof Error) throw compiled;
        const result = evaluate(compiled, lookupFromRecord(def.solution ?? {}));
        const offenders = result.constraints.filter((c) => c.status !== "satisfied");
        expect(offenders.map((c) => c.label ?? c.id)).toEqual([]);
        expect(result.complete).toBe(true);
        expect(result.status).toBe("valid");
    });

    it("is valid but unsolved from its givens alone", () => {
        const compiled = compilePuzzle(def, definitions);
        if (compiled instanceof Error) throw compiled;
        const result = evaluate(compiled, () => null);
        expect(result.status).toBe("valid");
        expect(result.complete).toBe(false);
    });
});

describe("mini sudoku uses no definitions", () => {
    it("compiles with an empty registry (proves runtime independence from definitions)", () => {
        const compiled = compile(miniSudoku, {});
        expect(compiled).not.toBeInstanceOf(Error);
        if (compiled instanceof Error) return;
        expect(compiled.constraints.every((c) => c.source === "primitive")).toBe(true);
    });
});

describe("first puzzle (linked from the landing page)", () => {
    it("has exactly one solution", async () => {
        const compiled = compilePuzzle(firstPuzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        expect((await solve(compiled)).status).toBe("unique");
    });
});
