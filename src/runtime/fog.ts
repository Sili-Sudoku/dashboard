/**
 * Fog reveal rule: which declared-hidden cells are still hidden right now.
 *
 * Only the *player's own progress* can trigger a reveal — a pre-existing
 * given is always "correct" by definition (that's what makes it a given),
 * so letting its correctness alone count would reveal hidden givens (or, by
 * propagation, their neighbors) the instant the puzzle loads, with zero
 * player action. So: a visible (non-hidden) cell only counts as a reveal
 * source once it's both non-given *and* holds its correct value — i.e. the
 * player filled it in correctly. A hidden cell can self-reveal the same way
 * (a hidden non-given cell the player fills in correctly), or reveal by
 * propagation from a neighboring source.
 *
 * Revealing (unfogging) a cell and that cell *becoming* a source itself are
 * two different things, though: a hidden non-given cell can be unfogged by
 * propagation alone — the player can see there's an empty cell there now —
 * without yet holding a value, and an empty cell obviously can't vouch for
 * its neighbors. So a declared cell only becomes a source once it's both
 * revealed *and* actually solved; a hidden given always satisfies both at
 * once it's revealed (its value was never in question), which is what lets
 * a chain of hidden givens peel back together as the player closes in.
 *
 * This is a small flood-fill over the declared hidden set, not a single
 * neighbor check — still cheap, bounded by the declared hidden-cell count,
 * not board size. Purely a function of the current board state, same shape
 * as `evaluate()`: no extra mutable state to keep in sync as the player types.
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

/** Everything currently hidden: fog's progressive reveal, plus cells a dynamic rule (#72) hasn't revealed yet. */
export const hiddenCells = (puzzle: CompiledPuzzle, lookup: ValueLookup): ReadonlySet<CellId> => {
    const fog = fogHiddenCells(puzzle, lookup);
    // A cell that isn't on the board yet is also hidden, so nothing about it can leak.
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
    // A cell is a propagation source only once it actually holds its
    // correct value: outside the declared set, that means non-given and
    // player-filled; inside it, that means already revealed (a hidden given
    // always qualifies the moment it's revealed; a hidden non-given cell
    // only once the player has also filled it in).
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
