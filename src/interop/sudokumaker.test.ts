import { describe, expect, it } from "vitest";
import { deflateRaw } from "pako";
import { encodeSudokuMakerShareLink, exportSudokuMaker, importSudokuMaker, type SudokuMakerExport } from "@/interop/sudokumaker.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { evaluate, lookupFromRecord } from "@/runtime/evaluate.ts";
import { definitions } from "@/definitions/index.ts";
import { isDefinitionRef, type PuzzleDefinition } from "@/runtime/puzzle.ts";

const id = (row: number, col: number) => col + row * 9;

/** A hand-built 9x9 SudokuMaker export. It has standard 3x3 boxes, one given, a killer cage, a thermometer, an arrow,
 *  both edge-clue kinds, and odd/even marks. The field shapes follow the format spec that the user reverse-engineered
 *  from the live app. A real share link verified the spec (see the module doc comment).
 *  This test does not derive the spec again. */
const sampleSudokuMaker = (): SudokuMakerExport => {
    const cells = Array.from({ length: 81 }, (_, i) => (i === 0 ? { given: true, value: 5 } : {}));
    const regions = Array.from({ length: 81 }, (_, i) => Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3));
    return {
        formatVersion: "1.6.0",
        puzzle: {
            name: "Sample Mix",
            author: "Test Author",
            comment: "Normal sudoku rules apply.",
            cells,
            constraints: [
                { type: 0 },
                { type: 1, regions },
                { type: 301, cages: [{ cells: [id(1, 0), id(1, 1)], value: 7 }] },
                { type: 300, thermometers: [[id(2, 0), id(2, 1), id(2, 2)]] },
                { type: 408, bulbsWithArrows: [{ bulbCells: [id(3, 0)], arrows: [[id(3, 0), id(3, 1), id(3, 2)]] }] },
                { type: 200, clues: [{ edge: 1 + 4 * 18, value: 1 }] }, // r5c1/r5c2
                { type: 201, clues: [{ edge: 1 + 5 * 18, value: 2 }] }, // r6c1/r6c2
                { type: 101, cells: [id(6, 0)] }, // odd, r7c1
                { type: 100, cells: [id(6, 1)] }, // even, r7c2
            ],
        },
    };
};

describe("importSudokuMaker", () => {
    it("rejects malformed input instead of throwing", () => {
        expect(importSudokuMaker("not json")).toBeInstanceOf(Error);
        expect(importSudokuMaker({ puzzle: {} })).toBeInstanceOf(Error);
        expect(importSudokuMaker("Xgarbageprefix")).toBeInstanceOf(Error);
    });

    it("imports metadata, standard boxes, givens, and every supported clue type", () => {
        const result = importSudokuMaker(sampleSudokuMaker());
        if (result instanceof Error) throw result;
        const { puzzle, warnings } = result;

        expect(warnings).toEqual([]);
        expect(puzzle.metadata.title).toBe("Sample Mix");
        expect(puzzle.metadata.author).toBe("Test Author");
        expect(puzzle.metadata.description).toBe("Normal sudoku rules apply.");
        expect(puzzle.geometry).toEqual({ type: "grid", width: 9, height: 9, boxWidth: 3, boxHeight: 3 });
        expect(puzzle.givens).toEqual({ r1c1: 5 });

        const sources = puzzle.constraints
            .filter((s): s is { use: string } => isDefinitionRef(s))
            .map((s) => s.use);
        expect(sources).toEqual(["sudoku", "killer", "thermometer", "arrow", "kropkiDifference", "kropkiRatio", "odd", "even"]);

        const compiled = compilePuzzle(puzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        expect(new Set(compiled.constraints.map((c) => c.source))).toEqual(
            new Set(["sudoku", "killer", "thermometer", "arrow", "kropkiDifference", "kropkiRatio", "odd", "even"]),
        );
    });

    it("reports unsupported constraint types as warnings instead of silently dropping them", () => {
        const data = sampleSudokuMaker();
        data.puzzle.constraints.push({ type: 202, clues: [] }); // XV
        const result = importSudokuMaker(data);
        if (result instanceof Error) throw result;
        expect(result.warnings.some((w) => w.includes("202"))).toBe(true);
    });

    it("falls back to named jigsaw regions when boxes aren't a rectangular tiling", () => {
        const data = sampleSudokuMaker();
        const regionsConstraint = data.puzzle.constraints.find((c) => c.type === 1) as unknown as { regions: number[] };
        // Swap the region of one cell with the region of its neighbor.
        // Then no (bw,bh) rectangular tiling can reproduce the partition.
        const a = regionsConstraint.regions[0];
        regionsConstraint.regions[0] = regionsConstraint.regions[3];
        regionsConstraint.regions[3] = a;

        const result = importSudokuMaker(data);
        if (result instanceof Error) throw result;
        expect(result.warnings.some((w) => w.includes("jigsaw"))).toBe(true);
        expect(result.puzzle.regions).toBeDefined();

        const compiled = compilePuzzle(result.puzzle, definitions);
        expect(compiled).not.toBeInstanceOf(Error);
    });

    it("decodes a real share link (D-prefixed deflate payload) end to end", () => {
        // Taken from a real share link, https://dev.sudokumaker.app/?puzzle=<payload>.
        // It is a 9x9 classic sudoku with two givens and standard 3x3 boxes. It has nothing else.
        const shareLink =
            "https://dev.sudokumaker.app/?puzzle=DpZHNCoMwEITfZc5B_LfkQXopHoJsraCJxChUybsX13Nt2vLtYZlhZ2F3w93YQbkr2akzGhJJVEYxBMZ5XXuC3KDVQJCAgJrdw9ijb6jvJ8jb5sVfhbZbSEM6O5PAovqZIJN3RvlVTHVuF4Ex6bmdB8Zkv93i85g_r1qgMXpyVnXa8cvgniNBxvvKo00ELLWd0bsfi52ESZkQJWNypmBClJKpmAsToNS-9v4F";
        const result = importSudokuMaker(shareLink);
        if (result instanceof Error) throw result;
        expect(result.warnings).toEqual([]);
        expect(result.puzzle.geometry).toEqual({ type: "grid", width: 9, height: 9, boxWidth: 3, boxHeight: 3 });
        expect(Object.keys(result.puzzle.givens ?? {})).toHaveLength(8);

        const compiled = compilePuzzle(result.puzzle, definitions);
        if (compiled instanceof Error) throw compiled;
        expect(new Set(compiled.constraints.map((c) => c.source))).toEqual(new Set(["sudoku"]));
    });

    it("also accepts just the bare payload, without the surrounding URL", () => {
        const shareLink =
            "https://dev.sudokumaker.app/?puzzle=DpZHNCoMwEITfZc5B_LfkQXopHoJsraCJxChUybsX13Nt2vLtYZlhZ2F3w93YQbkr2akzGhJJVEYxBMZ5XXuC3KDVQJCAgJrdw9ijb6jvJ8jb5sVfhbZbSEM6O5PAovqZIJN3RvlVTHVuF4Ex6bmdB8Zkv93i85g_r1qgMXpyVnXa8cvgniNBxvvKo00ELLWd0bsfi52ESZkQJWNypmBClJKpmAsToNS-9v4F";
        const payload = shareLink.slice(shareLink.indexOf("puzzle=") + "puzzle=".length);
        const result = importSudokuMaker(payload);
        if (result instanceof Error) throw result;
        expect(Object.keys(result.puzzle.givens ?? {})).toHaveLength(8);
    });
});

describe("exportSudokuMaker", () => {
    it("round-trips the hand-built sample through import -> export -> import", () => {
        const first = importSudokuMaker(sampleSudokuMaker());
        if (first instanceof Error) throw first;

        const exported = exportSudokuMaker(first.puzzle);
        if (exported instanceof Error) throw exported;
        expect(exported.warnings).toEqual([]);

        const second = importSudokuMaker(exported.data);
        if (second instanceof Error) throw second;
        expect(second.warnings).toEqual([]);
        expect(second.puzzle.geometry).toEqual(first.puzzle.geometry);
        expect(second.puzzle.givens).toEqual(first.puzzle.givens);

        const sources = (puzzle: PuzzleDefinition) =>
            new Set(puzzle.constraints.filter((s): s is { use: string } => isDefinitionRef(s)).map((s) => s.use));
        expect(sources(second.puzzle)).toEqual(sources(first.puzzle));
    });

    it("rejects a non-contiguous domain", () => {
        const puzzle: PuzzleDefinition = {
            version: 1,
            metadata: { id: "p", title: "Gappy" },
            geometry: { type: "grid", width: 4, height: 4 },
            domain: { values: [1, 2, 4, 5] },
            constraints: [],
        };
        expect(exportSudokuMaker(puzzle)).toBeInstanceOf(Error);
    });

    it("warns and drops a hand-written primitive constraint", () => {
        const puzzle: PuzzleDefinition = {
            version: 1,
            metadata: { id: "p", title: "Primitive" },
            geometry: { type: "grid", width: 4, height: 4 },
            domain: { values: [1, 2, 3, 4] },
            constraints: [{ use: "sudoku" }, ["allDifferent", ["cells", "row:0"]]],
        };
        const exported = exportSudokuMaker(puzzle);
        if (exported instanceof Error) throw exported;
        expect(exported.warnings.some((w) => w.includes("primitive"))).toBe(true);
    });

    it("encodes a share link that decodes back to the same data", () => {
        const puzzle: PuzzleDefinition = {
            version: 1,
            metadata: { id: "p", title: "Round Trip" },
            geometry: { type: "grid", width: 4, height: 4 },
            domain: { values: [1, 2, 3, 4] },
            constraints: [{ use: "sudoku" }],
        };
        const exported = exportSudokuMaker(puzzle);
        if (exported instanceof Error) throw exported;

        const link = encodeSudokuMakerShareLink(exported.data);
        expect(link).toMatch(/^https:\/\/sudokumaker\.app\/\?puzzle=D/);

        const reimported = importSudokuMaker(link);
        if (reimported instanceof Error) throw reimported;
        expect(reimported.puzzle.metadata.title).toBe("Round Trip");
        expect(reimported.puzzle.geometry).toEqual({ ...puzzle.geometry, boxWidth: 2, boxHeight: 2 });
    });
});

describe("a real solvable 4x4 jigsaw round-trips end to end", () => {
    it("imports, compiles, and the stated solution satisfies every constraint", () => {
        // 4x4 with irregular (non-2x2-box) regions: two interlocking L-tetrominoes,
        // a 2x2 block offset by one row, and a full row.
        // This is the same verified fixture as the equivalent jigsaw case in fpuzzles.test.ts.
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
        const cells = Array.from({ length: 16 }, (_, i) => {
            const r = Math.floor(i / 4);
            const c = i % 4;
            return r === 0 ? { given: true, value: solutionGrid[r][c] } : {};
        });
        const regions = Array.from({ length: 16 }, (_, i) => regionLayout[Math.floor(i / 4)][i % 4]);

        const result = importSudokuMaker({
            formatVersion: "1.6.0",
            puzzle: {
                name: "4x4 jigsaw",
                type: "custom",
                width: 4,
                height: 4,
                minDigit: 1,
                maxDigit: 4,
                cells,
                constraints: [{ type: 0 }, { type: 1, regions }],
            },
        });
        if (result instanceof Error) throw result;
        expect(result.puzzle.regions).toBeDefined();

        const compiled = compilePuzzle(result.puzzle, definitions);
        if (compiled instanceof Error) throw compiled;

        const solutionRecord: Record<string, number> = {};
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) solutionRecord[`r${r + 1}c${c + 1}`] = solutionGrid[r][c];
        const outcome = evaluate(compiled, lookupFromRecord(solutionRecord));
        expect(outcome.status).toBe("valid");
        expect(outcome.complete).toBe(true);
    });
});

describe("limits on outside data", () => {
    const toBase64Url = (bytes: Uint8Array) =>
        btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    it("stops a deflate bomb at the output limit", () => {
        // 50 MB of one character is about 50 KB when compressed.
        const bomb = toBase64Url(deflateRaw(new Uint8Array(50_000_000).fill(97)));
        const result = importSudokuMaker("D" + bomb);
        expect(result).toBeInstanceOf(Error);
        expect((result as Error).message).toMatch(/too large when unpacked/);
    });

    it("refuses a long lz-string payload without unpacking it", () => {
        const result = importSudokuMaker("N" + "A".repeat(30_000));
        expect((result as Error).message).toMatch(/too long/);
    });
});
