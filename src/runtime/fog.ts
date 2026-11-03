/**
 * Fog reveal rule: which declared-hidden cells are still hidden now.
 *
 * Only the *progress of the player* can cause a reveal.
 * A given is always "correct" by definition.
 * If its correctness alone counted, the puzzle would reveal hidden givens
 * (and, by propagation, their neighbors) when it loads, with no action by the player.
 * So a visible (non-hidden) cell is a reveal source only if it is non-given *and* holds its correct value.
 * That means the player filled it in correctly.
 * A hidden cell can reveal itself in the same way
 * (a hidden non-given cell that the player fills in correctly).
 * A hidden cell can also reveal by propagation from a neighboring source.
 *
 * To reveal (unfog) a cell and to make that cell a source are two different things.
 * Propagation alone can unfog a hidden non-given cell.
 * Then the player can see an empty cell there, but the cell has no value.
 * An empty cell cannot vouch for its neighbors.
 * So a declared cell becomes a source only when it is revealed *and* solved.
 * A hidden given satisfies both when it is revealed (its value is never in question).
 * So a chain of hidden givens peels back together as the player gets close.
 *
 * This is a small flood-fill over the declared hidden set, not a single neighbor check.
 * It is cheap: the cost depends on the number of declared hidden cells, not the board size.
 * It is a pure function of the current board state, like `evaluate()`.
 * There is no extra mutable state to keep in sync when the player types.
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
