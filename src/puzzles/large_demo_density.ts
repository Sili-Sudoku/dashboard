/**
 * `large_demo.ts` at realistic clue densities. A seeded PRNG carves the clues from its own known
 * `solution`. These are the same fixtures that benchmark the solver (src/runtime/solver.ts).
 * They stay here as viewable puzzles, not as throwaway test fixtures.
 * At 0%, 30% and 50%, the solver stops with "unknown" after the default time budget.
 * This is the classic CSP easy-hard-easy phase transition (see the solver's own comment).
 * At 70%, the solver finds a unique solution almost instantly.
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
        if (rand() < cluePercent) givens[cell] = value;
    }
    return givens;
};

const variant = (cluePercent: number, id: string, title: string): PuzzleDefinition => ({
    ...largeDemo,
    metadata: {
        ...largeDemo.metadata,
        id,
        title,
        description: `${largeDemo.metadata.description} ${Math.round(cluePercent * 100)}% of the cells are givens.`,
        tags: [...(largeDemo.metadata.tags ?? []), "benchmark"],
    },
    givens: seededGivens(cluePercent),
});

export const largeDemo0 = variant(0, "large-demo-0", "Large Demo (25x25) — 0% clues");
export const largeDemo30 = variant(0.3, "large-demo-30", "Large Demo (25x25) — 30% clues");
export const largeDemo50 = variant(0.5, "large-demo-50", "Large Demo (25x25) — 50% clues");
export const largeDemo70 = variant(0.7, "large-demo-70", "Large Demo (25x25) — 70% clues");
