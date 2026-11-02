import { describe, expect, it } from "vitest";

import { PuzzleBuilder } from "@/authoring/builder.ts";
import { puzzleToCode } from "@/authoring/to_code.ts";
import { kitchenSink } from "@/puzzles/kitchen_sink.ts";
import { listPuzzles } from "@/puzzles/index.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";

/** Run printed code the way the Author page's Run button does. */
const run = (code: string): PuzzleDefinition => new Function("PuzzleBuilder", code)(PuzzleBuilder) as PuzzleDefinition;
/**
 * The JSON form of a puzzle, with empty `givens`/`regions` treated as absent.
 * The builder never emits them. They have the same meaning.
 */
const json = (def: PuzzleDefinition): unknown => {
    const copy = JSON.parse(JSON.stringify(def)) as Record<string, unknown>;
    for (const key of ["givens", "regions"]) {
        if (copy[key] && Object.keys(copy[key] as object).length === 0) delete copy[key];
    }
    return copy;
};

describe("puzzleToCode", () => {
    for (const puzzle of [...listPuzzles(), kitchenSink]) {
        it(`round-trips ${puzzle.metadata.id}: running the printed code rebuilds the same puzzle`, () => {
            expect(json(run(puzzleToCode(puzzle)))).toEqual(json(puzzle));
        });
    }

    it("prints givens as a row picture when they fit one, else one call per cell", () => {
        const base = PuzzleBuilder.create("t", "T").grid(4, 4).domain([1, 2, 3, 4]).use("sudoku");
        expect(puzzleToCode(base.given("r1c1", 3).given("r2c2", 4).build())).toContain(
            '.givensFromRows(["3...", ".4..", "....", "...."])',
        );

        const big = PuzzleBuilder.create("t", "T").grid(4, 4).domain([1, 2, 3, 4]).given("r1c1", 12).build();
        const code = puzzleToCode(big);
        expect(code).toContain('.given("r1c1", 12)');
        expect(json(run(code))).toEqual(json(big));
    });

    it("keeps fog, regions, raw expressions, presentation and extra metadata", () => {
        const def = PuzzleBuilder.create("t", "T")
            .describe({ author: "me", tags: ["a", "b"] })
            .grid(4, 4, { boxWidth: 2, boxHeight: 2 })
            .domain([1, 2, 3, 4])
            .region("cage:A", ["r1c1", "r1c2"])
            .constraint(["==", ["sum", ["cells", "cage:A"]], 3])
            .fog(["r4c4"])
            .solution({ r4c4: 1 })
            .presentation({ cellSize: 48 })
            .build();
        const code = puzzleToCode(def);
        for (const part of [".describe(", ".fog([", ".region(", ".constraint([", ".presentation("])
            expect(code).toContain(part);
        expect(json(run(code))).toEqual(json(def));
    });
});
