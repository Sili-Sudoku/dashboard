/**
 * The inverse of running PuzzleBuilder code. It prints a `PuzzleDefinition` as the
 * `PuzzleBuilder` calls that rebuild it.
 * The Author page's Code tab uses it to show the puzzle that is loaded, not a fixed sample.
 * The code stays in sync with the JSON and Visual tabs.
 * to_code.test.ts pins round-trip exactness: running the printed code gives a definition equal to the input.
 * The test covers every puzzle in the repo.
 * So a new definition field cannot be dropped silently. The test fails until the builder gets a method for it
 * and this function prints it.
 */

import { givensFromRows } from "@/puzzles/grid_text.ts";
import { GridCellId, type CellId } from "@/runtime/geometry.ts";
import { isDefinitionRef, type PuzzleDefinition } from "@/runtime/puzzle.ts";

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** A JS literal for a JSON-ish value: bare keys, `{ a: 1 }` / `[1, 2]` spacing, one line. */
/** Every value goes into the code through here, so a value from outside can never become code. */
const literal = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(literal).join(", ")}]`;
    if (value && typeof value === "object") {
        const entries = Object.entries(value).filter(([, v]) => v !== undefined);
        if (entries.length === 0) return "{}";
        const body = entries.map(([k, v]) => `${IDENTIFIER.test(k) ? k : JSON.stringify(k)}: ${literal(v)}`);
        return `{ ${body.join(", ")} }`;
    }
    return JSON.stringify(value) ?? "undefined";
};

const sameCells = (a: Readonly<Record<CellId, number>>, b: Readonly<Record<CellId, number>>): boolean => {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

/**
 * A 9x9-style row picture ("5.3.." per row) when the cell map has single-digit values
 * on a grid. Otherwise undefined. Used only when reading the rows back gives the same map.
 */
const asRows = (map: Readonly<Record<CellId, number>>, width: number, height: number): string[] | undefined => {
    const rows: string[] = [];
    for (let r = 0; r < height; r++) {
        let row = "";
        for (let c = 0; c < width; c++) {
            const v = map[GridCellId(r, c)];
            if (v === undefined) row += ".";
            else if (Number.isInteger(v) && v >= 0 && v <= 9) row += String(v);
            else return undefined;
        }
        rows.push(row);
    }
    return sameCells(givensFromRows(rows), map) ? rows : undefined;
};

export const puzzleToCode = (def: PuzzleDefinition): string => {
    const { id, title, ...rest } = def.metadata;
    const calls: string[] = [];
    // The row-text shorthand exists only for a single grid. Elsewhere, the code lists cells one by one.
    const grid = def.geometry.type === "grid" ? def.geometry : undefined;

    if (Object.keys(rest).length > 0) calls.push(`.describe(${literal(rest)})`);

    if (def.geometry.type === "grid") {
        const { width, height, boxWidth, boxHeight } = def.geometry;
        const boxes = boxWidth !== undefined || boxHeight !== undefined ? `, ${literal({ boxWidth, boxHeight })}` : "";
        calls.push(`.grid(${literal(width)}, ${literal(height)}${boxes})`);
    } else calls.push(`.geometry(${literal(def.geometry)})`);
    calls.push(`.domain(${literal(def.domain.values)})`);

    const cellMap = (method: string, rowsMethod: string, map: Readonly<Record<CellId, number>>) => {
        const rows = grid && asRows(map, grid.width, grid.height);
        if (rows) calls.push(`.${rowsMethod}(${literal(rows)})`);
        else for (const [cell, value] of Object.entries(map)) calls.push(`.${method}(${literal(cell)}, ${literal(value)})`);
    };
    if (def.givens && Object.keys(def.givens).length > 0) cellMap("given", "givensFromRows", def.givens);

    for (const [name, cells] of Object.entries(def.regions ?? {}))
        calls.push(`.region(${literal(name)}, ${literal(cells)})`);

    for (const spec of def.constraints) {
        if (isDefinitionRef(spec)) {
            const { use, ...params } = spec;
            calls.push(
                Object.keys(params).length > 0 ? `.use(${literal(use)}, ${literal(params)})` : `.use(${literal(use)})`,
            );
        } else calls.push(`.constraint(${literal(spec)})`);
    }

    for (const object of def.objects ?? []) calls.push(`.visual(${literal(object)})`);
    if (def.fog) calls.push(`.fog(${literal(def.fog.hidden)})`);
    for (const rule of def.rules ?? []) calls.push(`.rule(${literal(rule)})`);

    if (def.solution) {
        const rows = grid && asRows(def.solution, grid.width, grid.height);
        calls.push(rows ? `.solutionFromRows(${literal(rows)})` : `.solution(${literal(def.solution)})`);
    }
    if (def.presentation) calls.push(`.presentation(${literal(def.presentation)})`);

    return [
        `return PuzzleBuilder.create(${literal(id)}, ${literal(title)})`,
        ...calls.map((c) => `  ${c}`),
        "  .build();",
    ].join("\n");
};
