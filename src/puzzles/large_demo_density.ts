/**
 * `large_demo.ts` at realistic clue densities, carved from its own known
 * `solution` via a seeded PRNG — the same fixtures used to benchmark the
 * solver (src/runtime/solver.ts) against #46. Kept here as viewable puzzles
 * rather than throwaway test fixtures: 0%/30%/50% show the solver bailing
 * out with "unknown" past the default time budget (the classic CSP
 * easy-hard-easy phase transition — see the solver's own comment), while
 * 70% solves uniquely almost instantly.
 */

import type { CellId } from "@/runtime/geometry.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import { largeDemo } from "@/puzzles/large_demo.ts";

const seededGivens = (cluePercent: number): Record<CellId, number> => {
    let seed = 12345;
    const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
    const givens: Record<CellId, number> = {};
    for (const [cell, value] of Object.entries(largeDemo.solution ?? {})) {
        if (rand() < cluePercent) givens[cell as CellId] = value;
    }
    return givens;
};

const variant = (cluePercent: number, id: string, title: string): PuzzleDefinition => ({
    ...largeDemo,
    metadata: {
        ...largeDemo.metadata,
        id,
        title,
        description: `${largeDemo.metadata.description} ${Math.round(cluePercent * 100)}% of cells given.`,
        tags: [...(largeDemo.metadata.tags ?? []), "benchmark"],
    },
    givens: seededGivens(cluePercent),
});

export const largeDemo0 = variant(0, "large-demo-0", "Large Demo (25x25) — 0% clues");
export const largeDemo30 = variant(0.3, "large-demo-30", "Large Demo (25x25) — 30% clues");
export const largeDemo50 = variant(0.5, "large-demo-50", "Large Demo (25x25) — 50% clues");
export const largeDemo70 = variant(0.7, "large-demo-70", "Large Demo (25x25) — 70% clues");
