import { describe, expect, it } from "vitest";

import { definitions } from "@/definitions/index.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { listPuzzles } from "@/puzzles/index.ts";
import { renderThumbnailSvg } from "@/renderer/thumbnail.ts";

const compiled = (def: Parameters<typeof compilePuzzle>[0]) => {
    const puzzle = compilePuzzle(def, definitions, { validateSolution: false });
    if (puzzle instanceof Error) throw puzzle;
    return puzzle;
};

describe("renderThumbnailSvg", () => {
    it("resolves every theme token for every registry puzzle (a new --token needs adding to THUMBNAIL_PALETTE)", () => {
        for (const def of listPuzzles()) {
            const svg = renderThumbnailSvg(compiled(def));
            expect(svg, def.metadata.id).not.toContain("var(");
            expect(svg, def.metadata.id).toMatch(/^<svg [^>]*viewBox=/);
        }
    });

    it("draws givens, never solution digits or anything the player would enter", () => {
        const def = listPuzzles().find((p) => p.givens && p.solution);
        if (!def) throw new Error("no registry puzzle with givens and a solution");
        const svg = renderThumbnailSvg(compiled(def));
        const digitCount = (svg.match(/<text [^>]*font-weight="600"/g) ?? []).length;
        expect(digitCount).toBe(Object.keys(def.givens ?? {}).length);
    });

    it("covers fog-hidden cells instead of leaking their givens", () => {
        const base = listPuzzles().find((p) => p.givens && Object.keys(p.givens).length > 0 && p.solution);
        if (!base?.givens) throw new Error("no usable registry puzzle");
        const cell = Object.keys(base.givens)[0];
        const svg = renderThumbnailSvg(compiled({ ...base, fog: { hidden: [cell] } }));
        expect(svg).toContain("#d9ceb0"); // the fog fill
        const digitCount = (svg.match(/<text [^>]*font-weight="600"/g) ?? []).length;
        expect(digitCount).toBe(Object.keys(base.givens).length - 1);
    });
});
