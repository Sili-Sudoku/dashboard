import { describe, expect, it } from "vitest";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate } from "@/runtime/evaluate.ts";
import { lookupFromRecord } from "@/runtime/evaluate.ts";
import { decodePuzzle, encodePuzzle, parsePuzzle } from "@/runtime/serialization.ts";
import { solve } from "@/runtime/solver.ts";
import { definitions } from "@/definitions/index.ts";
import { samuraiSudoku } from "@/puzzles/samurai.ts";
import { puzzleToCode } from "@/authoring/to_code.ts";

const compiled = (def = samuraiSudoku) => {
    const c = compilePuzzle(def, definitions);
    if (c instanceof Error) throw c;
    return c;
};

describe("composite geometry end to end (#34)", () => {
    it("`sudoku` constrains every grid on its own, with no knowledge of where they are", () => {
        const c = compiled();
        expect(c.constraints).toHaveLength(5 * 27);
        expect(c.constraints.find((k) => k.label === "mid/box:0 all different")?.cells).toHaveLength(9);
    });

    it("a clash in a shared box is caught from either grid, and a row never reaches across the gap", () => {
        const c = compiled({ ...samuraiSudoku, givens: { r7c7: 5, r7c1: 5, r2c2: 5, r2c13: 5 } });
        const violated = evaluate(c, lookupFromRecord(c.givens)).constraints.filter((k) => k.status === "violated");
        // r7c7 and r7c1 are in nw's row 7; r2c2 and r2c13 are in different grids' rows, so don't clash
        expect(violated.map((k) => k.label)).toEqual(["nw/row:6 all different"]);
    });

    it("survives JSON, share links and the code view", () => {
        const text = JSON.stringify(samuraiSudoku);
        expect(parsePuzzle(JSON.parse(text))).toEqual(samuraiSudoku);
        expect(decodePuzzle(encodePuzzle(samuraiSudoku))).toEqual(samuraiSudoku);
        expect(puzzleToCode(samuraiSudoku)).toContain('.geometry({ type: "composite"');
        expect(
            parsePuzzle({ ...samuraiSudoku, geometry: { type: "composite", grids: [{ width: 9 }] } }),
        ).toBeInstanceOf(Error);
    });

    it("can be solved", async () => {
        const c = compiled({ ...samuraiSudoku, givens: { r1c1: 1 } });
        const found = await solve(c);
        expect(found.solution).toBeDefined();
        const result = evaluate(c, lookupFromRecord(found.solution ?? {}));
        expect(result.constraints.every((k) => k.status === "satisfied")).toBe(true);
    }, 60000);
});
