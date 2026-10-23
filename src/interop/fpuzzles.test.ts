import { describe, expect, it } from "vitest";
import { exportFPuzzles, importFPuzzles, type FPuzzlesExport } from "@/interop/fpuzzles.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate, lookupFromRecord } from "@/runtime/evaluate.ts";
import { definitions } from "@/definitions/index.ts";
import { isDefinitionRef, type PuzzleDefinition } from "@/runtime/puzzle.ts";

/** A hand-built 9x9 f-puzzles export: standard 3x3 boxes, one given, a killer
 *  cage, a thermometer, an arrow, both kropki dot kinds, and odd/even marks.
 *  Field shapes are this importer's best-effort reconstruction of the public
 *  f-puzzles JSON (no network route to verify against a live export in this
 *  sandbox) — see the module doc comment. */
const sampleFPuzzles = (): FPuzzlesExport => {
    const grid = Array.from({ length: 9 }, (_, r) =>
        Array.from({ length: 9 }, (_, c) => ({
            region: Math.floor(r / 3) * 3 + Math.floor(c / 3),
            ...(r === 0 && c === 0 ? { value: 5, given: true } : {}),
        })),
    );
    return {
        size: 9,
        grid,
        title: "Sample Mix",
        author: "Test Author",
        ruleset: "Normal sudoku rules apply.",
        killercage: [{ cells: ["R2C1", "R2C2"], value: "7" }],
        thermometer: [{ lines: [["R3C1", "R3C2", "R3C3"]] }],
        arrow: [{ cells: ["R4C1"], lines: [["R4C1", "R4C2", "R4C3"]] }],
        difference: [{ cells: ["R5C1", "R5C2"], value: "1" }],
        ratio: [{ cells: ["R6C1", "R6C2"], value: "2" }],
        odd: [{ cell: "R7C1" }],
        even: ["R7C2"],
    };
};

describe("importFPuzzles", () => {
    it("rejects malformed input instead of throwing", () => {
        expect(importFPuzzles("not json")).toBeInstanceOf(Error);
        expect(importFPuzzles({ size: 9 })).toBeInstanceOf(Error);
        expect(importFPuzzles({ size: 0, grid: [] })).toBeInstanceOf(Error);
    });

    it("imports metadata, standard boxes, givens, and every supported clue type", () => {
        const result = importFPuzzles(sampleFPuzzles());
        if (result instanceof Error) throw result;
        const { puzzle, warnings } = result;

        expect(warnings).toEqual([]);
        expect(puzzle.metadata.title).toBe("Sample Mix");
        expect(puzzle.metadata.author).toBe("Test Author");
        expect(puzzle.metadata.description).toBe("Normal sudoku rules apply.");
        expect(puzzle.geometry).toEqual({ type: "grid", width: 9, height: 9, boxWidth: 3, boxHeight: 3 });
        expect(puzzle.givens).toEqual({ r1c1: 5 });

        const sources = puzzle.constraints
            .filter((s): s is { use: string } => typeof s === "object" && s !== null && !Array.isArray(s))
            .map((s) => s.use);
        expect(sources).toEqual(["sudoku", "killer", "thermometer", "arrow", "kropkiDifference", "kropkiRatio", "odd", "even"]);

        const compiled = compilePuzzle(puzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        expect(new Set(compiled.constraints.map((c) => c.source))).toEqual(
            new Set(["sudoku", "killer", "thermometer", "arrow", "kropkiDifference", "kropkiRatio", "odd", "even"]),
        );
    });

    it("reports unsupported clue types as warnings instead of silently dropping them", () => {
        const data = sampleFPuzzles() as unknown as Record<string, unknown>;
        data.palindrome = [{ cells: ["R1C1", "R1C2"] }];
        const result = importFPuzzles(data);
        if (result instanceof Error) throw result;
        expect(result.warnings.some((w) => w.includes("palindrome"))).toBe(true);
    });

    it("falls back to named jigsaw regions when boxes aren't a rectangular tiling", () => {
        const data = sampleFPuzzles();
        // Swap one cell's region with its neighbor's box so no (bw,bh) rectangular
        // tiling can reproduce the partition.
        data.grid[0][3].region = data.grid[0][0].region;
        data.grid[0][0].region = 1;

        const result = importFPuzzles(data);
        if (result instanceof Error) throw result;
        expect(result.warnings.some((w) => w.includes("jigsaw"))).toBe(true);
        expect(result.puzzle.regions).toBeDefined();
        expect(Object.keys(result.puzzle.regions ?? {}).length).toBeGreaterThan(0);

        const compiled = compilePuzzle(result.puzzle, definitions);
        expect(compiled).not.toBeInstanceOf(Error);
    });

    it("falls back to the default (sqrt-based) box size, with a warning, when region data is incomplete", () => {
        // 9x9 is a perfect square, so missing region data defaults to standard 3x3
        // boxes rather than dropping the box constraint outright (see fpuzzles.ts).
        const data = sampleFPuzzles();
        delete data.grid[8][8].region;
        const result = importFPuzzles(data);
        if (result instanceof Error) throw result;
        expect(result.warnings.some((w) => w.includes("region"))).toBe(true);
        expect(result.puzzle.regions).toBeUndefined();
        expect(result.puzzle.geometry).toEqual({ type: "grid", width: 9, height: 9 });

        const compiled = compilePuzzle(result.puzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        expect(compiled.constraints.some((c) => c.label?.startsWith("box:"))).toBe(true);
    });

    it("disables boxes outright, with a warning, when region data is incomplete on a non-square-sized grid", () => {
        // 6x6's default box (per geometry.ts) degenerates to one box covering the
        // whole grid, which would make allDifferent impossible — so unlike the 9x9
        // case above, boxes stay off here.
        const data: FPuzzlesExport = {
            size: 6,
            grid: Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => ({}))),
            title: "No regions at all",
        };
        const result = importFPuzzles(data);
        if (result instanceof Error) throw result;
        expect(result.warnings).toEqual([
            "not every cell declares a region; box/region all-different constraint omitted",
        ]);
        expect(result.puzzle.geometry).toEqual({ type: "grid", width: 6, height: 6 });

        const compiled = compilePuzzle(result.puzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        expect(compiled.constraints.some((c) => c.label?.startsWith("box:"))).toBe(false);
    });

    it("arrow: the line's leading cell is the bulb even when 'cells' also repeats it (matches a real f-puzzles export)", () => {
        // Verified against an actual f-puzzles.com share link: a single-cell-bulb
        // arrow's "lines" entry includes the bulb as its first cell, with "cells"
        // separately repeating it — not a bulb-free shaft as the doc comment on an
        // earlier draft of this importer wrongly assumed.
        const data = sampleFPuzzles();
        data.arrow = [{ cells: ["R1C1"], lines: [["R1C1", "R1C2", "R1C3"]] }];
        const result = importFPuzzles(data);
        if (result instanceof Error) throw result;
        const arrowRef = result.puzzle.constraints.find((s) => isDefinitionRef(s) && s.use === "arrow");
        expect(arrowRef).toEqual({ use: "arrow", bulb: "r1c1", cells: ["r1c2", "r1c3"] });

        const compiled = compilePuzzle(result.puzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        const arrowConstraint = compiled.constraints.find((c) => c.source === "arrow");
        // sum(shaft) == value(bulb); with r1c1=5 (the sample's given) and the
        // shaft cells both filled with 2, 2+2 should equal the bulb's value (5),
        // i.e. this check should fail -- proving the shaft genuinely excludes r1c1.
        const outcome = evaluate(compiled, lookupFromRecord({ r1c1: 5, r1c2: 2, r1c3: 2 }));
        const status = outcome.constraints.find((c) => c.id === arrowConstraint?.id)?.status;
        expect(status).toBe("violated"); // 2+2=4 != 5 -- confirms r1c1 isn't double-counted into the shaft
    });

    it("imports a flat row-major solution array of numeric strings", () => {
        const data = sampleFPuzzles();
        data.solution = Array.from({ length: 81 }, () => "1"); // not a valid sudoku solution, just shape-valid
        const result = importFPuzzles(data);
        if (result instanceof Error) throw result;
        expect(result.puzzle.solution?.r1c1).toBe(1);
        expect(result.puzzle.solution?.r9c9).toBe(1);
    });
});

describe("exportFPuzzles", () => {
    it("round-trips a hand-authored puzzle's clue types through import", () => {
        const puzzle: PuzzleDefinition = {
            version: 1,
            metadata: { id: "p", title: "Round Trip", author: "Me", description: "rules" },
            geometry: { type: "grid", width: 9, height: 9 },
            domain: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
            givens: { r1c1: 5 },
            constraints: [
                { use: "sudoku" },
                { use: "killer", cells: ["r2c1", "r2c2"], sum: 7 },
                { use: "thermometer", cells: ["r3c1", "r3c2", "r3c3"] },
                { use: "arrow", bulb: "r4c1", cells: ["r4c2", "r4c3"] },
                { use: "kropkiDifference", cells: ["r5c1", "r5c2"] },
                { use: "kropkiRatio", cells: ["r6c1", "r6c2"], value: 3 },
                { use: "odd", cell: "r7c1" },
                { use: "even", cell: "r7c2" },
            ],
        };

        const exported = exportFPuzzles(puzzle);
        if (exported instanceof Error) throw exported;
        expect(exported.warnings).toEqual([]);
        expect(exported.data.grid[0][0]).toEqual({ value: 5, given: true, region: 0 });

        const reimported = importFPuzzles(exported.data);
        if (reimported instanceof Error) throw reimported;
        expect(reimported.warnings).toEqual([]);

        const compiled = compilePuzzle(reimported.puzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        expect(new Set(compiled.constraints.map((c) => c.source))).toEqual(
            new Set(["sudoku", "killer", "thermometer", "arrow", "kropkiDifference", "kropkiRatio", "odd", "even"]),
        );
    });

    it("reports (does not silently drop) constraints it cannot represent", () => {
        const puzzle: PuzzleDefinition = {
            version: 1,
            metadata: { id: "p", title: "Unsupported" },
            geometry: { type: "grid", width: 4, height: 4 },
            domain: { values: [1, 2, 3, 4] },
            constraints: [{ use: "sudoku" }, ["allDifferent", ["cells", "row:0"]], { use: "someFutureVariant", foo: 1 }],
        };
        const exported = exportFPuzzles(puzzle);
        if (exported instanceof Error) throw exported;
        expect(exported.warnings).toHaveLength(2);
        expect(exported.warnings.some((w) => w.includes("primitive"))).toBe(true);
        expect(exported.warnings.some((w) => w.includes("someFutureVariant"))).toBe(true);
    });

    it("rejects non-square grids", () => {
        const puzzle: PuzzleDefinition = {
            version: 1,
            metadata: { id: "p", title: "Rect" },
            geometry: { type: "grid", width: 4, height: 6 },
            domain: { values: [1, 2, 3, 4] },
            constraints: [],
        };
        expect(exportFPuzzles(puzzle)).toBeInstanceOf(Error);
    });

    it("exports a complete solution as a flat row-major array", () => {
        const puzzle: PuzzleDefinition = {
            version: 1,
            metadata: { id: "p", title: "Solved" },
            geometry: { type: "grid", width: 2, height: 2, boxWidth: 2, boxHeight: 1 },
            domain: { values: [1, 2] },
            constraints: [{ use: "sudoku" }],
            solution: { r1c1: 1, r1c2: 2, r2c1: 2, r2c2: 1 },
        };
        const exported = exportFPuzzles(puzzle);
        if (exported instanceof Error) throw exported;
        expect(exported.data.solution).toEqual(["1", "2", "2", "1"]);
    });
});

describe("importFPuzzles: real f-puzzles.com share link", () => {
    // Captured from an actual share link, https://f-puzzles.com/?load=<payload> —
    // a 6x6 arrow sudoku with no region data at all. 6 isn't a perfect square, so
    // this hits the "disable boxes outright" branch (box constraint omitted, with
    // a warning) rather than the default-box-size fallback — see fpuzzles.ts. It
    // also has six single-cell-bulb arrows; this is the fixture that caught a real
    // bug: the "cells" field on an arrow clue repeats the bulb that's already the
    // line's first entry, rather than the line being bulb-free shaft-only.
    const shareLink =
        "https://f-puzzles.com/?load=N4IgzglgXgpiBcA2ANCALhNAbO8QBUYw0ACABwFcoocRUBDCtACwHsAnBEAZQiwgDG9LHRABzdhAAmCANqzQAN2EVcAJlRiIimADsEadqoC+yJStwBGTdr0GjMU+ayqEAZhs798QybMhlF1wAFk87HwcnAIsEFHFbb19Hf0DXeABWMMTIgF1kBWighFD4r3s/ZzS4rTKIisK0zNLwpKjU9Szy5MqrTrruhtwPZuyTPIL2hCaalsiUmPgNEa62hZKZ0YHJ+Gtl/tWi+GGNlfnD6oSV8Z6EXZP9s7Tjy4ebpD7Wx9xpl8+3pfuf0GxQ+uXybwutSB23WvzmbzucPq22eUPhwIyoORCwBSMc1wxqNm2MOPzRJLSuPJWwWkOJNMOsOpBzSiOZOTyIHo7HYrAA7nJQPxdEQ5LIQAAlSwAYWCoglaml6XlbiVIA5qAEMCwWDAcklMrlOSiwtF8HkBulbnlirlqAlqqNnK1Or15st1uN/lNbotEuCsvl6UD9sQVvVzu1uv1/sDXqFEBFvvFset9uDaclYbUEc1Ud9koDnpNibNfsVmYd0pz9oDOY1IBd0fdCvD8ZAPrFksVNclqss8oDA4bTYLrfrxmNQA=";

    it("decodes the share link, imports cleanly, and the puzzle's own grid satisfies every arrow", () => {
        const result = importFPuzzles(shareLink);
        if (result instanceof Error) throw result;

        expect(result.puzzle.metadata.title).toBe("Test puzzle");
        expect(result.puzzle.metadata.author).toBe("Silical");
        expect(result.puzzle.geometry).toEqual({ type: "grid", width: 6, height: 6 });
        expect(result.warnings).toEqual([
            "not every cell declares a region; box/region all-different constraint omitted",
        ]);
        expect(Object.keys(result.puzzle.givens ?? {})).toHaveLength(36);

        const compiled = compilePuzzle(result.puzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        expect(new Set(compiled.constraints.map((c) => c.source))).toEqual(new Set(["sudoku", "arrow"]));
        expect(compiled.constraints.filter((c) => c.source === "arrow")).toHaveLength(6);

        const outcome = evaluate(compiled, lookupFromRecord(compiled.givens));
        expect(outcome.status).toBe("valid");
        expect(outcome.complete).toBe(true);
    });

    it("also accepts just the bare 'load' payload, without the surrounding URL", () => {
        const payload = shareLink.slice(shareLink.indexOf("load=") + "load=".length);
        const result = importFPuzzles(payload);
        if (result instanceof Error) throw result;
        expect(result.puzzle.metadata.title).toBe("Test puzzle");
    });

    it("rejects garbage that isn't JSON and doesn't decode as a share link", () => {
        expect(importFPuzzles("not json, not base64 either #$%")).toBeInstanceOf(Error);
    });
});

describe("a real solvable 4x4 jigsaw round-trips end to end", () => {
    it("imports, compiles, and the stated solution satisfies every constraint", () => {
        // 4x4 with irregular (non-2x2-box) regions: two interlocking L-tetrominoes,
        // a 2x2 block offset by one row, and a full row.
        const regionLayout = [
            [0, 0, 1, 1],
            [0, 2, 2, 1],
            [0, 2, 2, 1],
            [3, 3, 3, 3],
        ];
        const solutionGrid = [
            [1, 2, 3, 4],
            [3, 1, 4, 2],
            [4, 3, 2, 1],
            [2, 4, 1, 3],
        ];
        const grid = regionLayout.map((row, r) =>
            row.map((region, c) => ({ region, value: solutionGrid[r][c], given: r === 0 })),
        );
        const data: FPuzzlesExport = { size: 4, grid, title: "Jigsaw 4x4" };

        const result = importFPuzzles(data);
        if (result instanceof Error) throw result;
        expect(result.puzzle.regions).toBeDefined();

        const compiled = compilePuzzle(result.puzzle, definitions);
        if (compiled instanceof Error) throw compiled;

        const flatSolution: Record<string, number> = {};
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) flatSolution[`r${r + 1}c${c + 1}`] = solutionGrid[r][c];

        const outcome = evaluate(compiled, lookupFromRecord(flatSolution));
        expect(outcome.status).toBe("valid");
        expect(outcome.complete).toBe(true);
    });
});
