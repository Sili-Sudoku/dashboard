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
