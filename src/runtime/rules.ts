/**
 * What the dynamic rules (#72) of the puzzle do now.
 * The `when` of a rule is evaluated on the current board with the same three-valued logic as a constraint.
 * It counts only when it is *definitely* true.
 * While it is undecided (cells are still empty), the rule has not happened.
 * These are pure functions of the board, like `hiddenCells`.
 * So there is no state to keep in sync, and nothing extra to undo or save.
 *
 * `enable` and `disable` do not appear here. The compiler folds them into the constraints.
 */

import { createGeometry, type CellId } from "@/runtime/geometry.ts";
import { evalExpr } from "@/runtime/operators.ts";
import type { ValueLookup } from "@/runtime/evaluate.ts";
import { objectIds, type CompiledPuzzle, type CompiledRule, type VisualObject } from "@/runtime/puzzle.ts";

/** The rules with a condition that is definitely true on this board. */
export const holdingRules = (puzzle: CompiledPuzzle, lookup: ValueLookup): ReadonlySet<CompiledRule> => {
    if (puzzle.rules.length === 0) return new Set();
    const ctx = {
        geometry: createGeometry(puzzle.geometry),
        regions: puzzle.regions,
        domain: puzzle.domain,
        valueOf: lookup,
    };
    const holding = new Set<CompiledRule>();
    for (const rule of puzzle.rules) {
        try {
            const value = evalExpr(rule.when, ctx);
            if (value.t === "bool" && value.v) holding.add(rule);
        } catch {
            // The compiler reports a malformed condition. Here, it never holds.
        }
    }
    return holding;
};

/** Cells that a rule keeps hidden until the rule holds. */
export const ruleHiddenCells = (puzzle: CompiledPuzzle, lookup: ValueLookup): ReadonlySet<CellId> => {
    const hidden = new Set<CellId>();
    if (!puzzle.rules.some((r) => r.reveal.length > 0)) return hidden;
    const holding = holdingRules(puzzle, lookup);
    // If several rules reveal a cell, the cell shows when any one of them holds.
    const revealed = new Set<CellId>();
    for (const rule of puzzle.rules) if (holding.has(rule)) for (const c of rule.reveal) revealed.add(c);
    for (const rule of puzzle.rules) for (const c of rule.reveal) if (!revealed.has(c)) hidden.add(c);
    return hidden;
};

/** Cells that are not on the board yet: a rule makes them `appear` and none of those rules holds. */
export const ruleAbsentCells = (puzzle: CompiledPuzzle, lookup: ValueLookup): ReadonlySet<CellId> => {
    const absent = new Set<CellId>();
    if (!puzzle.rules.some((r) => r.appear.length > 0)) return absent;
    const holding = holdingRules(puzzle, lookup);
    const present = new Set<CellId>();
    for (const rule of puzzle.rules) if (holding.has(rule)) for (const c of rule.appear) present.add(c);
    for (const rule of puzzle.rules) for (const c of rule.appear) if (!present.has(c)) absent.add(c);
    return absent;
};

/** The visual objects of the puzzle as the renderer must draw them now. */
export const visibleObjects = (puzzle: CompiledPuzzle, lookup: ValueLookup): readonly VisualObject[] => {
    if (!puzzle.rules.some((r) => r.show.length > 0 || r.hide.length > 0)) return puzzle.objects;
    const holding = holdingRules(puzzle, lookup);
    const shown = new Set<string>();
    const hiddenIds = new Set<string>();
    const gated = new Set<string>();
    for (const rule of puzzle.rules) {
        for (const id of rule.show) {
            gated.add(id);
            if (holding.has(rule)) shown.add(id);
        }
        if (holding.has(rule)) for (const id of rule.hide) hiddenIds.add(id);
    }
    return puzzle.objects.filter((o) => {
        const ids = objectIds(o);
        if (ids.some((id) => hiddenIds.has(id))) return false;
        return !ids.some((id) => gated.has(id)) || ids.some((id) => shown.has(id));
    });
};
