/**
 * Fog reveal rule: which declared-hidden cells are still hidden now.
 * It is a pure function of the board, like `evaluate()`, so no extra state needs syncing when the player types.
 * It is a flood fill over the declared hidden set, so its cost does not depend on the board size.
 *
 * Only the player's progress can reveal. A given is "correct" by definition, so counting it as a source would
 * reveal hidden givens and their neighbors on load. A cell is a source only if it is non-given and holds its
 * correct value, or it is a hidden given that has been revealed.
 *
 * Revealing a cell and making it a source are different. Propagation can unfog a hidden non-given cell,
 * but it is empty and cannot vouch for its neighbors. It becomes a source only when it is revealed *and* solved.
 * A hidden given is both once revealed, so a chain of hidden givens peels back together.
 */

import type { CellId } from "@/runtime/geometry.ts";
import { createGeometry } from "@/runtime/geometry.ts";
import type { CompiledPuzzle } from "@/runtime/puzzle.ts";
import { ruleAbsentCells, ruleHiddenCells } from "@/runtime/rules.ts";
import type { ValueLookup } from "@/runtime/evaluate.ts";

const isSolved = (solution: Readonly<Record<CellId, number>>, lookup: ValueLookup, cell: CellId): boolean => {
    const answer = solution[cell];
    return answer !== undefined && lookup(cell) === answer;
};

/** All hidden cells: the progressive reveal of fog, and cells that a dynamic rule has not revealed. */
export const hiddenCells = (puzzle: CompiledPuzzle, lookup: ValueLookup): ReadonlySet<CellId> => {
    const fog = fogHiddenCells(puzzle, lookup);
    // A cell that is not on the board yet is also hidden, so no information about it can leak.
    const byRules = new Set([...ruleHiddenCells(puzzle, lookup), ...ruleAbsentCells(puzzle, lookup)]);
    return byRules.size === 0 ? fog : new Set([...fog, ...byRules]);
};

const fogHiddenCells = (puzzle: CompiledPuzzle, lookup: ValueLookup): ReadonlySet<CellId> => {
    const declared = puzzle.fog?.hidden;
    const solution = puzzle.solution;
    if (!declared || declared.length === 0 || !solution) return new Set();

    const geometry = createGeometry(puzzle.geometry);
    const declaredSet = new Set(declared.filter((c) => geometry.has(c)));

    const revealed = new Set<CellId>();
    // A cell is a propagation source only when it holds its correct value.
    // Outside the declared set, that means non-given and filled in by the player.
    // Inside the declared set, that means already revealed.
    // A hidden given qualifies when it is revealed.
    // A hidden non-given cell qualifies only after the player also fills it in.
    const isSource = (cell: CellId): boolean => {
        if (!isSolved(solution, lookup, cell)) return false;
        return declaredSet.has(cell) ? revealed.has(cell) : !(cell in puzzle.givens);
    };

    let changed = true;
    while (changed) {
        changed = false;
        for (const cell of declaredSet) {
            if (revealed.has(cell)) continue;
            const selfTrigger = !(cell in puzzle.givens) && isSolved(solution, lookup, cell);
            const neighborTrigger = geometry.neighbors(cell).some(isSource);
            if (selfTrigger || neighborTrigger) {
                revealed.add(cell);
                changed = true;
            }
        }
    }

    const hidden = new Set<CellId>();
    for (const cell of declaredSet) {
        if (!revealed.has(cell)) hidden.add(cell);
    }
    return hidden;
};
