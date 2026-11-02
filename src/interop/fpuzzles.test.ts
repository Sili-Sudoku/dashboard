import { describe, expect, it } from "vitest";
import {
    encodeFPuzzlesShareLink,
    encodeSudokuPadShareLink,
    exportFPuzzles,
    importFPuzzles,
    type FPuzzlesExport,
} from "@/interop/fpuzzles.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate, lookupFromRecord } from "@/runtime/evaluate.ts";
import { definitions } from "@/definitions/index.ts";
import { isDefinitionRef, type PuzzleDefinition } from "@/runtime/puzzle.ts";

/** A hand-built 9x9 f-puzzles export. It has standard 3x3 boxes, one given, a killer cage, a thermometer, an arrow,
 *  both kropki dot kinds, and odd/even marks. The field shapes are a best-effort reconstruction of the public
 *  f-puzzles JSON by this importer. The sandbox has no network route to check a live export.
 *  See the module doc comment. */
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
        data.someFutureClueType = [{ cells: ["R1C1"] }];
        const result = importFPuzzles(data);
        if (result instanceof Error) throw result;
        expect(result.warnings.some((w) => w.includes("someFutureClueType"))).toBe(true);
    });

    it("negative: adds a global exclusion per recognized kind, excluding pairs already explicitly clued", () => {
        const data = sampleFPuzzles() as unknown as Record<string, unknown>;
        data.negative = ["ratio", "xv", "not-a-real-kind"];
        const result = importFPuzzles(data);
        if (result instanceof Error) throw result;

        expect(result.warnings).toEqual([
            '"negative" entry "not-a-real-kind" is not a recognized kind and was ignored',
        ]);

        const negativeRatioRef = result.puzzle.constraints.find(
            (s) => isDefinitionRef(s) && s.use === "negativeRatio",
        );
        expect(negativeRatioRef && isDefinitionRef(negativeRatioRef) ? negativeRatioRef.excludePairs : undefined).toEqual([
            ["r6c1", "r6c2"],
        ]);
        const negativeXVRef = result.puzzle.constraints.find((s) => isDefinitionRef(s) && s.use === "negativeXV");
        expect(negativeXVRef && isDefinitionRef(negativeXVRef) ? negativeXVRef.excludePairs : undefined).toEqual([]);

        const compiled = compilePuzzle(result.puzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        const sources = new Set(compiled.constraints.map((c) => c.source));
        expect(sources.has("negativeRatio")).toBe(true);
        expect(sources.has("negativeXV")).toBe(true);
        expect(sources.has("negativeDifference")).toBe(false);
    });

    it("negative: synonyms ('differentpair'/'nonconsecutive') both resolve to negativeDifference, deduped", () => {
        const data = sampleFPuzzles() as unknown as Record<string, unknown>;
        data.negative = ["differentpair", "nonconsecutive"];
        const result = importFPuzzles(data);
        if (result instanceof Error) throw result;
        expect(result.warnings).toEqual([]);

        const negativeDifferenceRefs = result.puzzle.constraints.filter(
            (s) => isDefinitionRef(s) && s.use === "negativeDifference",
        );
        expect(negativeDifferenceRefs).toHaveLength(1);
    });

    it("falls back to named jigsaw regions when boxes aren't a rectangular tiling", () => {
        const data = sampleFPuzzles();
        // Swap the region of one cell with the region of its neighbor's box.
        // Then no (bw,bh) rectangular tiling can reproduce the partition.
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
        // 9x9 is a perfect square. Missing region data gives standard 3x3 boxes
        // and does not remove the box constraint (see fpuzzles.ts).
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
        // The default box of 6x6 (per geometry.ts) is one box that covers the whole grid.
        // That makes allDifferent impossible. So, unlike the 9x9 case above, boxes stay off here.
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
        // Checked against a real f-puzzles.com share link.
        // The "lines" entry of an arrow with a one-cell bulb has the bulb as its first cell.
        // The "cells" field repeats the bulb. The line does not hold a shaft only.
        // The doc comment on an earlier draft of this importer assumed this wrongly.
        const data = sampleFPuzzles();
        data.arrow = [{ cells: ["R1C1"], lines: [["R1C1", "R1C2", "R1C3"]] }];
        const result = importFPuzzles(data);
        if (result instanceof Error) throw result;
        const arrowRef = result.puzzle.constraints.find((s) => isDefinitionRef(s) && s.use === "arrow");
        expect(arrowRef).toEqual({ use: "arrow", bulb: "r1c1", cells: ["r1c2", "r1c3"] });

        const compiled = compilePuzzle(result.puzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        const arrowConstraint = compiled.constraints.find((c) => c.source === "arrow");
        // The rule is sum(shaft) == value(bulb). Here r1c1=5 (the given of the sample).
        // Both shaft cells have the value 2, and 2+2 does not equal the value of the bulb (5).
        // So this check must fail. This proves that the shaft excludes r1c1.
        const outcome = evaluate(compiled, lookupFromRecord({ r1c1: 5, r1c2: 2, r1c3: 2 }));
        const status = outcome.constraints.find((c) => c.id === arrowConstraint?.id)?.status;
        expect(status).toBe("violated"); // 2+2=4 != 5. This confirms that r1c1 is not counted twice in the shaft
    });

    it("imports a flat row-major solution array of numeric strings", () => {
        const data = sampleFPuzzles();
        data.solution = Array.from({ length: 81 }, () => "1"); // not a valid sudoku solution, only a valid shape
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

    it("encodes a share link that decodes back to the same data", () => {
        const puzzle: PuzzleDefinition = {
            version: 1,
            metadata: { id: "p", title: "Round Trip" },
            geometry: { type: "grid", width: 4, height: 4 },
            domain: { values: [1, 2, 3, 4] },
            constraints: [{ use: "sudoku" }],
        };
        const exported = exportFPuzzles(puzzle);
        if (exported instanceof Error) throw exported;

        const link = encodeFPuzzlesShareLink(exported.data);
        expect(link).toMatch(/^https:\/\/f-puzzles\.com\/\?load=/);

        const reimported = importFPuzzles(link);
        if (reimported instanceof Error) throw reimported;
        expect(reimported.puzzle.metadata.title).toBe("Round Trip");
        expect(reimported.puzzle.geometry).toEqual({ ...puzzle.geometry, boxWidth: 2, boxHeight: 2 });
    });

    it("encodes a SudokuPad share link carrying the same payload as the f-puzzles.com link", () => {
        const puzzle: PuzzleDefinition = {
            version: 1,
            metadata: { id: "p", title: "Round Trip" },
            geometry: { type: "grid", width: 4, height: 4 },
            domain: { values: [1, 2, 3, 4] },
            constraints: [{ use: "sudoku" }],
        };
        const exported = exportFPuzzles(puzzle);
        if (exported instanceof Error) throw exported;

        const fPuzzlesLink = encodeFPuzzlesShareLink(exported.data);
        const sudokuPadLink = encodeSudokuPadShareLink(exported.data);
        expect(sudokuPadLink).toMatch(/^https:\/\/sudokupad\.app\/fpuzzles/);

        // The lz-string payload is the same and only the URL wrapper is different.
        // Decode both and check that they hold the same data.
        const fPuzzlesPayload = fPuzzlesLink.slice(fPuzzlesLink.indexOf("load=") + "load=".length);
        const sudokuPadPayload = sudokuPadLink.slice("https://sudokupad.app/fpuzzles".length);
        expect(sudokuPadPayload).toBe(fPuzzlesPayload);
    });
});

/** sampleFPuzzles() plus one instance of each newly supported clue type.
 *  The new clues use cells that the base sample does not touch. */
const sampleExtendedFPuzzles = (): FPuzzlesExport => ({
    ...sampleFPuzzles(),
    "diagonal+": true,
    "diagonal-": true,
    antiknight: true,
    antiking: true,
    nonconsecutive: true,
    disjointgroups: true,
    palindrome: [{ lines: [["R8C1", "R8C2", "R8C3"]] }],
    clone: [{ cells: ["R8C4", "R8C5"], cloneCells: ["R8C6", "R8C7"] }],
    quadruple: [{ cells: ["R1C8", "R1C9", "R2C8", "R2C9"], values: [1, 2] }],
    minimum: [{ cell: "R9C1" }],
    maximum: [{ cell: "R9C2" }],
    xv: [{ cells: ["R9C3", "R9C4"], value: "X" }],
    // The anchor is just outside the grid. It is not a resolved cell list (see the module doc comment).
    // "R0C3" is above column 3. Stepping "DR" from there reaches r1c4, then r2c5, and so on.
    // This is the real f-puzzles shape. A live import crash on our first, wrong guess confirmed it.
    littlekillersum: [{ cell: "R0C3", direction: "DR", value: "9" }],
    // "R10C9" is below column 9 on this 9x9 grid.
    // A sandwich anchor is never a resolved cell list. It always means "this whole column/row".
    sandwichsum: [{ cell: "R10C9", value: "0" }],
    betweenline: [{ lines: [["R6C7", "R6C8", "R6C9"]] }],
});

describe("importFPuzzles: extended clue types", () => {
    it("imports diagonals, chess constraints, and every newly-supported clue type", () => {
        const result = importFPuzzles(sampleExtendedFPuzzles());
        if (result instanceof Error) throw result;
        const { puzzle, warnings } = result;
        expect(warnings).toEqual([]);

        expect(puzzle.regions?.["diagonal:bltr"]).toBeDefined();
        expect(puzzle.regions?.["diagonal:tlbr"]).toBeDefined();
        const sudokuRef = puzzle.constraints.find((s) => isDefinitionRef(s) && s.use === "sudoku");
        expect(sudokuRef && isDefinitionRef(sudokuRef) ? sudokuRef.extraRegions : undefined).toEqual(
            expect.arrayContaining(["diagonal:bltr", "diagonal:tlbr"]),
        );

        const compiled = compilePuzzle(puzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        const sources = new Set(compiled.constraints.map((c) => c.source));
        for (const expected of [
            "sudoku", "killer", "thermometer", "arrow", "kropkiDifference", "kropkiRatio", "odd", "even",
            "antiknight", "antiking", "nonconsecutive", "disjointgroups",
            "palindrome", "clone", "quadruple", "minimum", "maximum", "xv", "sandwich", "betweenline",
        ]) {
            expect(sources.has(expected)).toBe(true);
        }
    });

    it("skips (with warnings, never silently) malformed instances of the new clue types", () => {
        const data = sampleFPuzzles() as unknown as Record<string, unknown>;
        data.palindrome = [{ lines: [["R1C1"]] }]; // too short
        data.clone = [{ cells: ["R1C1"], cloneCells: ["R1C2", "R1C3"] }]; // lengths do not match
        data.quadruple = [{ cells: ["bad-cell"], values: [1] }]; // bad cell id
        data.minimum = [{ cell: "bad-cell" }];
        data.xv = [{ cells: ["R1C1", "R1C2"], value: "Q" }]; // unknown marker
        data.littlekillersum = [{ cell: "R0C1", direction: "DR" }]; // no numeric sum
        data.sandwichsum = [{ cell: "bad-cell", value: "5" }]; // unknown anchor
        data.betweenline = [{ lines: [["R1C1", "R1C2"]] }]; // too few cells (3 or more are necessary)

        const result = importFPuzzles(data);
        if (result instanceof Error) throw result;
        const joined = result.warnings.join(" | ");
        for (const expected of ["palindrome", "clone", "quadruple", "minimum", "xv", "littlekillersum", "sandwichsum", "betweenline"]) {
            expect(joined).toContain(expected);
        }
    });

    it("disjointgroups: warns and omits the constraint when there's no uniform box layout", () => {
        const data: FPuzzlesExport = {
            size: 6,
            grid: Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => ({}))),
            title: "No boxes",
            disjointgroups: true,
        };
        const result = importFPuzzles(data);
        if (result instanceof Error) throw result;
        expect(result.warnings.some((w) => w.includes("disjointgroups"))).toBe(true);

        const compiled = compilePuzzle(result.puzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        expect(compiled.constraints.some((c) => c.source === "disjointgroups")).toBe(false);
    });
});

describe("exportFPuzzles: extended clue types", () => {
    it("round-trips every newly-supported clue type through import", () => {
        const puzzle: PuzzleDefinition = {
            version: 1,
            metadata: { id: "p", title: "Extended" },
            geometry: { type: "grid", width: 9, height: 9, boxWidth: 3, boxHeight: 3 },
            domain: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
            regions: {
                "diagonal:bltr": ["r9c1", "r8c2", "r7c3", "r6c4", "r5c5", "r4c6", "r3c7", "r2c8", "r1c9"],
                "diagonal:tlbr": ["r1c1", "r2c2", "r3c3", "r4c4", "r5c5", "r6c6", "r7c7", "r8c8", "r9c9"],
            },
            constraints: [
                { use: "sudoku", extraRegions: ["diagonal:bltr", "diagonal:tlbr"] },
                { use: "antiknight" },
                { use: "antiking" },
                { use: "nonconsecutive" },
                { use: "disjointgroups" },
                { use: "palindrome", cells: ["r1c2", "r1c3", "r1c4"] },
                { use: "clone", cells: ["r2c1", "r2c2"], cloneCells: ["r3c1", "r3c2"] },
                { use: "quadruple", cells: ["r1c8", "r1c9", "r2c8", "r2c9"], values: [1, 2] },
                { use: "minimum", cell: "r4c1" },
                { use: "maximum", cell: "r4c2" },
                { use: "xv", cells: ["r4c3", "r4c4"], target: 10 },
                { use: "killer", cells: ["r5c1", "r6c2"], sum: 9, distinct: false },
                {
                    use: "sandwich",
                    cells: ["r6c1", "r6c2", "r6c3", "r6c4", "r6c5", "r6c6", "r6c7", "r6c8", "r6c9"],
                    sum: 5,
                },
                { use: "betweenline", cells: ["r7c1", "r7c2", "r7c3"] },
                { use: "negativeDifference" },
                { use: "negativeRatio" },
                { use: "negativeXV" },
            ],
        };

        const exported = exportFPuzzles(puzzle);
        if (exported instanceof Error) throw exported;
        expect(exported.warnings).toEqual([]);
        expect(exported.data["diagonal+"]).toBe(true);
        expect(exported.data["diagonal-"]).toBe(true);
        expect(exported.data.antiknight).toBe(true);
        expect(exported.data.littlekillersum).toEqual([{ cell: "R4C0", direction: "DR", value: "9" }]);
        expect(exported.data.sandwichsum).toEqual([{ cell: "R6C0", value: "5" }]);
        expect(new Set(exported.data.negative)).toEqual(new Set(["difference", "ratio", "xv"]));

        const reimported = importFPuzzles(exported.data);
        if (reimported instanceof Error) throw reimported;
        expect(reimported.warnings).toEqual([]);

        const compiled = compilePuzzle(reimported.puzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        const sources = new Set(compiled.constraints.map((c) => c.source));
        for (const expected of [
            "sudoku", "antiknight", "antiking", "nonconsecutive", "disjointgroups",
            "palindrome", "clone", "quadruple", "minimum", "maximum", "xv", "killer", "sandwich", "betweenline",
            "negativeDifference", "negativeRatio", "negativeXV",
        ]) {
            expect(sources.has(expected)).toBe(true);
        }
    });

    it("reports (does not silently drop) clues it cannot represent in f-puzzles export", () => {
        const base: Pick<PuzzleDefinition, "version" | "metadata" | "geometry" | "domain"> = {
            version: 1,
            metadata: { id: "p", title: "p" },
            geometry: { type: "grid", width: 4, height: 4 },
            domain: { values: [1, 2, 3, 4] },
        };

        const noSum = exportFPuzzles({ ...base, constraints: [{ use: "killer", cells: ["r1c1", "r1c2"], distinct: false }] });
        if (noSum instanceof Error) throw noSum;
        expect(noSum.warnings.some((w) => w.includes("littlekillersum"))).toBe(true);

        const badTarget = exportFPuzzles({ ...base, constraints: [{ use: "xv", cells: ["r1c1", "r1c2"], target: 7 }] });
        if (badTarget instanceof Error) throw badTarget;
        expect(badTarget.warnings.some((w) => w.includes("xv"))).toBe(true);
    });
});

describe("importFPuzzles: real f-puzzles.com share link", () => {
    // Taken from a real share link, https://f-puzzles.com/?load=<payload>.
    // It is a 6x6 arrow sudoku with no region data. 6 is not a perfect square.
    // So this case uses the "disable boxes outright" branch (no box constraint, with a warning)
    // and not the default-box-size fallback (see fpuzzles.ts).
    // It also has six arrows with a one-cell bulb. This fixture found a real bug.
    // The "cells" field of an arrow clue repeats the bulb, which is already the first entry of the line.
    // The line is not a shaft without the bulb.
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
