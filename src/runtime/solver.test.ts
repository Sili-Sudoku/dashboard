import { describe, expect, it } from "vitest";
import { compilePuzzle } from "@/runtime/compile.ts";
import { solve } from "@/runtime/solver.ts";
import type { CompiledPuzzle } from "@/runtime/puzzle.ts";
import { classicSudoku } from "@/puzzles/classic_sudoku.ts";
import { largeDemo } from "@/puzzles/large_demo.ts";
import { definitions } from "@/definitions/index.ts";

const compile = (puzzle: unknown): CompiledPuzzle => {
    const result = compilePuzzle(puzzle as Parameters<typeof compilePuzzle>[0]);
    if (result instanceof Error) throw result;
    return result;
};

describe("solve", () => {
    it("finds the unique solution of a 2x2 Latin square with one given", async () => {
        // Order-2 Latin squares: only [[1,2],[2,1]] and [[2,1],[1,2]] exist;
        // fixing r1c1=1 picks exactly one of them.
        const puzzle = compile({
            version: 1,
            metadata: { id: "latin2", title: "latin2" },
            geometry: { type: "grid", width: 2, height: 2 },
            domain: { values: [1, 2] },
            givens: { r1c1: 1 },
            constraints: [
                ["allDifferent", ["cells", "row:0"]],
                ["allDifferent", ["cells", "row:1"]],
                ["allDifferent", ["cells", "col:0"]],
                ["allDifferent", ["cells", "col:1"]],
            ],
        });

        const result = await solve(puzzle);
        expect(result.status).toBe("unique");
        expect(result.solution).toEqual({ r1c1: 1, r1c2: 2, r2c1: 2, r2c2: 1 });
    });

    it("reports multiple when most of the board is unconstrained", async () => {
        // Only row:0 is constrained; row:1 has no constraints at all, so every
        // row:0 arrangement combines with 4 free row:1 assignments.
        const puzzle = compile({
            version: 1,
            metadata: { id: "under", title: "under" },
            geometry: { type: "grid", width: 2, height: 2 },
            domain: { values: [1, 2] },
            constraints: [["allDifferent", ["cells", "row:0"]]],
        });

        const result = await solve(puzzle);
        expect(result.status).toBe("multiple");
        expect(result.solution).toBeDefined();
    });

    it("reports no solution when givens conflict immediately", async () => {
        const puzzle = compile({
            version: 1,
            metadata: { id: "conflict", title: "conflict" },
            geometry: { type: "grid", width: 2, height: 1 },
            domain: { values: [1, 2] },
            givens: { r1c1: 1, r1c2: 1 },
            constraints: [["allDifferent", ["cells", "row:0"]]],
        });

        const result = await solve(puzzle);
        expect(result.status).toBe("none");
        expect(result.probes).toBe(0);
    });

    it("reports no solution when infeasibility only emerges from combining separate constraints", async () => {
        // Three cells, pairwise all-different, domain of only 2 values: by
        // pigeonhole impossible, but no single pairwise constraint is
        // infeasible on its own — only backtracking across all three proves it.
        const puzzle = compile({
            version: 1,
            metadata: { id: "triangle", title: "triangle" },
            geometry: { type: "grid", width: 3, height: 1 },
            domain: { values: [1, 2] },
            constraints: [
                ["allDifferent", ["cells", ["r1c1", "r1c2"]]],
                ["allDifferent", ["cells", ["r1c2", "r1c3"]]],
                ["allDifferent", ["cells", ["r1c1", "r1c3"]]],
            ],
        });

        const result = await solve(puzzle);
        expect(result.status).toBe("none");
        // No probes needed: plain allDifferent constraints are resolved
        // entirely by the cheap direct-membership path, never touching the
        // generic oracle.
        expect(result.probes).toBe(0);
    });

    it("solves a real published 9x9 sudoku uniquely", async () => {
        const compiled = compilePuzzle(classicSudoku, definitions);
        if (compiled instanceof Error) throw compiled;

        const result = await solve(compiled);
        expect(result.status).toBe("unique");
        expect(result.solution).toEqual(classicSudoku.solution);
    });

    it("gives up with 'unknown' instead of guessing once the probe budget is exhausted", async () => {
        // A sum constraint isn't a plain allDifferent, so it's classified
        // "complex" and genuinely needs the oracle (unlike the fixtures
        // above, which the cheap path resolves without ever calling it).
        const puzzle = compile({
            version: 1,
            metadata: { id: "sum", title: "sum" },
            geometry: { type: "grid", width: 2, height: 1 },
            domain: { values: [1, 2] },
            constraints: [["==", ["sum", ["cells", ["r1c1", "r1c2"]]], 3]],
        });

        const result = await solve(puzzle, { maxProbes: 0 });
        expect(result.status).toBe("unknown");
        expect(result.probes).toBe(1);
    });

    it("bails out gracefully on a wide-open 25x25 board instead of hanging, under the default time budget", async () => {
        const compiled = compilePuzzle(largeDemo, definitions);
        if (compiled instanceof Error) throw compiled;

        const t0 = performance.now();
        const result = await solve(compiled);
        const elapsedMs = performance.now() - t0;

        expect(["multiple", "unknown"]).toContain(result.status);
        expect(elapsedMs).toBeLessThan(3_000);
    });
});
