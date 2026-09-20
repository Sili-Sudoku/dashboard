/**
 * Small helpers for writing grid puzzles by hand: turn rows of characters into
 * `{ r1c1: 5, ... }` maps. "." or " " means empty.
 */

import { GridCellId, type CellId } from "@/runtime/geometry.ts";

export const givensFromRows = (rows: readonly string[]): Record<CellId, number> => {
    const out: Record<CellId, number> = {};
    rows.forEach((row, r) => {
        [...row].forEach((ch, c) => {
            if (ch === "." || ch === " ") return;
            const n = Number(ch);
            if (Number.isNaN(n)) throw new Error(`bad given char "${ch}" at r${r + 1}c${c + 1}`);
            out[GridCellId(r, c)] = n;
        });
    });
    return out;
};

export const omit = <T extends Record<string, unknown>>(obj: T, keys: readonly string[]): T => {
    const clone = { ...obj };
    for (const k of keys) delete clone[k];
    return clone;
};
