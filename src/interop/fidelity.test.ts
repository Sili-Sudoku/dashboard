import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { importFPuzzles } from "@/interop/fpuzzles.ts";
import { KNOWN_TOP_LEVEL_KEYS } from "@/interop/fpuzzles_import.ts";
import { importSudokuMaker } from "@/interop/sudokumaker.ts";

const doc = readFileSync(new URL("../../docs/IMPORT_FIDELITY.md", import.meta.url), "utf8");

const grid = (size: number) =>
    Array.from({ length: size }, (_, r) =>
        Array.from({ length: size }, (_, c) => ({ value: r === 0 && c === 0 ? 1 : undefined })),
    );

describe("import fidelity: nothing is dropped silently", () => {
    it("the matrix names every f-puzzles key the importer knows", () => {
        const missing = [...KNOWN_TOP_LEVEL_KEYS].filter((k) => !doc.includes(`\`${k}\``));
        expect(missing).toEqual([]);
    });

    for (const key of ["line", "cage", "circle", "rectangle", "text", "extraregion", "somethingNew"]) {
        it(`f-puzzles: an unsupported "${key}" is warned about by name, and the rest still imports`, () => {
            const result = importFPuzzles({ size: 4, grid: grid(4), [key]: [{ cells: ["R1C1", "R1C2"] }] });
            if (result instanceof Error) throw result;
            expect(result.warnings.some((w) => w.includes(`"${key}"`))).toBe(true);
            expect(result.puzzle.constraints?.length).toBeGreaterThan(0);
        });
    }

    it("SudokuMaker: an unsupported constraint type is warned about by number", () => {
        const result = importSudokuMaker({
            formatVersion: "1",
            puzzle: { size: 4, cells: grid(4).flat(), constraints: [{ type: 0 }, { type: 999 }] },
        });
        if (result instanceof Error) throw result;
        expect(result.warnings.some((w) => w.includes("999"))).toBe(true);
    });
});
