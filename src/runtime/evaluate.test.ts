import { describe, expect, it } from "vitest";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate, lookupFromRecord, affectedConstraints } from "@/runtime/evaluate.ts";
import type { CompiledPuzzle } from "@/runtime/puzzle.ts";
import type { CellId } from "@/runtime/geometry.ts";

const compile = (): CompiledPuzzle => {
    const result = compilePuzzle({
        version: 1,
        metadata: { id: "e", title: "e" },
        geometry: { type: "grid", width: 4, height: 4, boxWidth: 2, boxHeight: 2 },
        domain: { values: [1, 2, 3, 4] },
        constraints: [
            ["allDifferent", ["cells", "row:0"]],
            ["==", ["sum", ["cells", "row:1"]], 10],
        ],
    });
    if (result instanceof Error) throw result;
    return result;
};

const solvedRow0 = { r1c1: 1, r1c2: 2, r1c3: 3, r1c4: 4 };

describe("evaluate", () => {
    const puzzle = compile();

    it("reports incomplete constraints on an empty board", () => {
        const result = evaluate(puzzle, () => null);
        expect(result.status).toBe("valid");
        expect(result.complete).toBe(false);
        expect(result.constraints.every((c) => c.status === "incomplete")).toBe(true);
        expect(result.filledCount).toBe(0);
    });

    it("marks a satisfied constraint and keeps the puzzle valid", () => {
        const result = evaluate(puzzle, lookupFromRecord(solvedRow0));
        const row0 = result.constraints[0];
        expect(row0.status).toBe("satisfied");
        expect(result.status).toBe("valid");
    });

    it("marks a violated constraint, collects its cells, and turns the puzzle invalid", () => {
        const result = evaluate(puzzle, lookupFromRecord({ r1c1: 3, r1c2: 3 }));
        expect(result.constraints[0].status).toBe("violated");
        expect(result.status).toBe("invalid");
        expect([...result.violatedCells].sort()).toContain("r1c1");
    });

    it("narrows an allDifferent violation to the duplicate cells, not the whole group", () => {
        // r1c1/r1c3 share 3; r1c2/r1c4 are each unique and shouldn't be flagged.
        const result = evaluate(puzzle, lookupFromRecord({ r1c1: 3, r1c2: 1, r1c3: 3, r1c4: 2 }));
        expect(result.constraints[0].status).toBe("violated");
        expect([...result.violatedCells].sort()).toEqual(["r1c1", "r1c3"]);
    });

    it("flags values outside the domain", () => {
        const result = evaluate(puzzle, lookupFromRecord({ r1c1: 7 }));
        expect(result.invalidCells.has("r1c1")).toBe(true);
        expect(result.status).toBe("invalid");
    });

    it("reports completion only when every cell is filled and every constraint satisfied", () => {
        const full: Record<CellId, number> = {
            r1c1: 1, r1c2: 2, r1c3: 3, r1c4: 4,
            r2c1: 4, r2c2: 3, r2c3: 2, r2c4: 1,
            r3c1: 2, r3c2: 1, r3c3: 4, r3c4: 3,
            r4c1: 3, r4c2: 4, r4c3: 1, r4c4: 2,
        };
        const result = evaluate(puzzle, lookupFromRecord(full));
        expect(result.filledCount).toBe(16);
        expect(result.constraints.map((c) => c.status)).toEqual(["satisfied", "satisfied"]);
        expect(result.complete).toBe(true);
    });

    it("affectedConstraints narrows to constraints touching changed cells", () => {
        expect(affectedConstraints(puzzle, ["r1c1"])).toEqual([puzzle.constraints[0].id]);
        expect(affectedConstraints(puzzle, ["r2c2"])).toEqual([puzzle.constraints[1].id]);
        expect(affectedConstraints(puzzle, ["r3c3"])).toEqual([]);
    });
});

describe("evaluate — early infeasibility detection", () => {
    it("flags a thermometer-style run as violated once the head leaves no room for the rest", () => {
        // 3-cell strictly increasing run, domain 1-4: a '4' in the head leaves no
        // room for two more strictly-larger values, even though no descending
        // pair exists yet (the other two cells are still empty).
        const puzzle = compilePuzzle({
            version: 1,
            metadata: { id: "therm", title: "therm" },
            geometry: { type: "grid", width: 3, height: 1, boxWidth: 3, boxHeight: 1 },
            domain: { values: [1, 2, 3, 4] },
            constraints: [["strictIncreasing", ["cells", ["r1c1", "r1c2", "r1c3"]]]],
        });
        if (puzzle instanceof Error) throw puzzle;

        const result = evaluate(puzzle, lookupFromRecord({ r1c1: 4 }));
        expect(result.constraints[0].status).toBe("violated");
        expect([...result.violatedCells]).toEqual(["r1c1", "r1c2", "r1c3"]);
    });

    it("flags an allDifferent group as violated by pigeonhole, before any cell is even filled", () => {
        // 3 cells, only 2 domain values to go around: no assignment can make
        // them all different, true from the very first evaluation.
        const puzzle = compilePuzzle({
            version: 1,
            metadata: { id: "pigeon", title: "pigeon" },
            geometry: { type: "grid", width: 3, height: 1, boxWidth: 3, boxHeight: 1 },
            domain: { values: [1, 2] },
            constraints: [["allDifferent", ["cells", ["r1c1", "r1c2", "r1c3"]]]],
        });
        if (puzzle instanceof Error) throw puzzle;

        const result = evaluate(puzzle, () => null);
        expect(result.constraints[0].status).toBe("violated");
        expect(result.status).toBe("invalid");
    });

    it("flags an unreachable cage sum", () => {
        // 2 empty cells, domain 1-4: the minimum possible sum is 1+1=2, so a
        // target of 1 can never be reached.
        const puzzle = compilePuzzle({
            version: 1,
            metadata: { id: "cage", title: "cage" },
            geometry: { type: "grid", width: 2, height: 1, boxWidth: 2, boxHeight: 1 },
            domain: { values: [1, 2, 3, 4] },
            constraints: [["==", ["sum", ["cells", ["r1c1", "r1c2"]]], 1]],
        });
        if (puzzle instanceof Error) throw puzzle;

        const result = evaluate(puzzle, () => null);
        expect(result.constraints[0].status).toBe("violated");
    });

    it("stays incomplete, making no claim, once the search space exceeds the cap", () => {
        // 5 empty cells over a 9-value domain (9^5 = 59049) is obviously
        // unreachable by a sum of 1000 to a human, but it's over the exhaustive
        // search cap — so this must NOT be reported as violated, matching the
        // "never guess a violation we can't prove" rule.
        const puzzle = compilePuzzle({
            version: 1,
            metadata: { id: "toobig", title: "toobig" },
            geometry: { type: "grid", width: 5, height: 1, boxWidth: 5, boxHeight: 1 },
            domain: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
            constraints: [["==", ["sum", ["cells", ["r1c1", "r1c2", "r1c3", "r1c4", "r1c5"]]], 1000]],
        });
        if (puzzle instanceof Error) throw puzzle;

        const result = evaluate(puzzle, () => null);
        expect(result.constraints[0].status).toBe("incomplete");
    });

    it("does not flag a reachable target, even with several empty cells", () => {
        const puzzle = compilePuzzle({
            version: 1,
            metadata: { id: "reachable", title: "reachable" },
            geometry: { type: "grid", width: 3, height: 1, boxWidth: 3, boxHeight: 1 },
            domain: { values: [1, 2, 3, 4] },
            constraints: [["==", ["sum", ["cells", ["r1c1", "r1c2", "r1c3"]]], 9]],
        });
        if (puzzle instanceof Error) throw puzzle;

        const result = evaluate(puzzle, () => null);
        expect(result.constraints[0].status).toBe("incomplete");
    });
});
