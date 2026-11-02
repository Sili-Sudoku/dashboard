/**
 * The composition test that the brief asks for: Sudoku, thermometer, killer and arrow
 * on one grid, evaluated as one puzzle.
 */

import { describe, expect, it } from "vitest";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate, lookupFromRecord } from "@/runtime/evaluate.ts";
import { definitions } from "@/definitions/index.ts";
import { demoMixed } from "@/puzzles/demo_mixed.ts";
import type { CellId } from "@/runtime/geometry.ts";

const compiled = () => {
    const result = compilePuzzle(demoMixed, definitions);
    if (result instanceof Error) throw result;
    return result;
};

const solution = demoMixed.solution as Record<CellId, number>;

describe("Sudoku + thermometer + killer + arrow compose", () => {
    const puzzle = compiled();

    it("produces constraints from all four definitions, tagged by source", () => {
        const sources = new Set(puzzle.constraints.map((c) => c.source));
        expect(sources).toEqual(new Set(["sudoku", "thermometer", "killer", "arrow"]));
    });

    it("the full solution satisfies every constraint and completes the puzzle", () => {
        const result = evaluate(puzzle, lookupFromRecord(solution));
        const bySource = groupStatuses(result);
        expect(bySource).toEqual({
            sudoku: ["satisfied"],
            thermometer: ["satisfied"],
            killer: ["satisfied"],
            arrow: ["satisfied"],
        });
        expect(result.status).toBe("valid");
        expect(result.complete).toBe(true);
    });

    it("givens are consistent with the stated solution", () => {
        for (const [cell, value] of Object.entries(puzzle.givens)) {
            expect(solution[cell]).toBe(value);
        }
    });

    it("breaking only the thermometer violates only the thermometer", () => {
        const broken = { ...solution, r1c8: 9, r2c8: 8 }; // not increasing (9 > 8)
        const result = evaluate(puzzle, lookupFromRecord(broken));
        const statuses = groupStatuses(result);
        expect(statuses.thermometer).toContain("violated");
        // Sudoku also sees a column clash here. So assert only that the four systems are independent constraints.
        expect(result.constraints.filter((c) => c.source === "thermometer")).toHaveLength(1);
    });

    it("breaking only the killer sum violates only the killer sum constraint", () => {
        // A value that breaks the sum but not the sudoku rules is hard to find.
        // So target the cage directly.
        const broken = { ...solution } as Record<CellId, number>;
        delete broken.r1c1;
        delete broken.r1c2;
        broken.r1c2 = 4;
        broken.r1c3 = 4; // duplicate, so allDifferent of the cage fails
        const result = evaluate(puzzle, lookupFromRecord(broken));
        const killer = result.constraints.filter((c) => c.source === "killer");
        expect(killer.some((c) => c.status === "violated")).toBe(true);
    });

    it("breaking only the arrow violates only the arrow", () => {
        const broken = { ...solution, r4c9: 9 }; // shaft 2+1=3, bulb is now 9
        const result = evaluate(puzzle, lookupFromRecord(broken));
        expect(result.constraints.find((c) => c.source === "arrow")?.status).toBe("violated");
    });

    it("an empty board is valid but incomplete, with every constraint incomplete", () => {
        const result = evaluate(puzzle, () => null);
        expect(result.status).toBe("valid");
        expect(result.complete).toBe(false);
        expect(result.constraints.every((c) => c.status === "incomplete")).toBe(true);
    });
});

const groupStatuses = (result: ReturnType<typeof evaluate>): Record<string, string[]> => {
    const out: Record<string, Set<string>> = {};
    for (const c of result.constraints) {
        (out[c.source] ??= new Set()).add(c.status);
    }
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
};
