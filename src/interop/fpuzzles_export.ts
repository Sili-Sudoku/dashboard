/** PuzzleDefinition -> f-puzzles JSON and share links. See `fpuzzles.ts` for what is covered. */

import { compressToBase64 } from "lz-string";
import { GridGeometry, type CellId } from "@/runtime/geometry.ts";
import { isDefinitionRef, type PuzzleDefinition } from "@/runtime/puzzle.ts";
import {
    type FPuzzlesCell,
    type FPuzzlesCellsClue,
    type FPuzzlesLinesClue,
    type FPuzzlesArrowClue,
    type FPuzzlesCloneClue,
    type FPuzzlesQuadrupleClue,
    type FPuzzlesCellClue,
    type FPuzzlesOutsideClue,
    type FPuzzlesLittleKillerClue,
    type FPuzzlesExport,
    type ExportResult,
    toFPuzzlesCell,
    sandwichAnchor,
    littleKillerAnchor,
} from "@/interop/fpuzzles_format.ts";

export const exportFPuzzles = (def: PuzzleDefinition): ExportResult | Error => {
    if (def.geometry.type !== "grid") return new Error("f-puzzles export supports only grid geometries");
    const { width, height } = def.geometry;
    if (width !== height) return new Error("f-puzzles export supports only square grids");
    const size = width;

    const warnings: string[] = [];
    const geometry = new GridGeometry(def.geometry);

    const diagonalPlus = Object.keys(def.regions ?? {}).includes("diagonal:bltr");
    const diagonalMinus = Object.keys(def.regions ?? {}).includes("diagonal:tlbr");

    const regionOf = new Map<CellId, number>();
    const jigsawEntries = Object.entries(def.regions ?? {}).filter(([name]) => name.startsWith("fbox:"));
    if (jigsawEntries.length > 0) {
        for (const [name, cells] of jigsawEntries) {
            const region = Number(name.slice("fbox:".length));
            for (const cell of cells) regionOf.set(cell, region);
        }
    } else {
        const boxesAcross = Math.ceil(geometry.width / geometry.boxWidth);
        const boxesDown = Math.ceil(geometry.height / geometry.boxHeight);
        for (let i = 0; i < boxesAcross * boxesDown; i++) {
            for (const cell of geometry.resolveRegion(`box:${i}`) ?? []) regionOf.set(cell, i);
        }
    }

    const grid: FPuzzlesCell[][] = [];
    for (let r = 0; r < size; r++) {
        const row: FPuzzlesCell[] = [];
        for (let c = 0; c < size; c++) {
            const cell: CellId = `r${r + 1}c${c + 1}`;
            const given = def.givens?.[cell];
            const fc: FPuzzlesCell = {};
            if (given !== undefined) {
                fc.value = given;
                fc.given = true;
            }
            const region = regionOf.get(cell);
            if (region !== undefined) fc.region = region;
            row.push(fc);
        }
        grid.push(row);
    }

    const cage: FPuzzlesCellsClue[] = [];
    const thermometer: FPuzzlesLinesClue[] = [];
    const arrow: FPuzzlesArrowClue[] = [];
    const difference: FPuzzlesCellsClue[] = [];
    const ratio: FPuzzlesCellsClue[] = [];
    const odd: FPuzzlesCellClue[] = [];
    const even: FPuzzlesCellClue[] = [];
    const minimumClues: FPuzzlesCellClue[] = [];
    const maximumClues: FPuzzlesCellClue[] = [];
    const palindromeLines: FPuzzlesLinesClue[] = [];
    const cloneClues: FPuzzlesCloneClue[] = [];
    const quadrupleClues: FPuzzlesQuadrupleClue[] = [];
    const xvClues: FPuzzlesCellsClue[] = [];
    const littlekillersumClues: FPuzzlesLittleKillerClue[] = [];
    const sandwichsumClues: FPuzzlesOutsideClue[] = [];
    const betweenlineLines: FPuzzlesLinesClue[] = [];
    let antiknightFlag = false;
    let antikingFlag = false;
    let nonconsecutiveFlag = false;
    let disjointgroupsFlag = false;
    const negativeKinds = new Set<"difference" | "ratio" | "xv">();

    const exportCells = (cells: readonly CellId[]): string[] | undefined => {
        const out: string[] = [];
        for (const c of cells) {
            const f = toFPuzzlesCell(c);
            if (!f) return undefined;
            out.push(f);
        }
        return out;
    };

    for (const spec of def.constraints) {
        if (!isDefinitionRef(spec)) {
            warnings.push(
                "f-puzzles export cannot represent a hand-written primitive constraint. The exporter drops it",
            );
            continue;
        }
        const { use, ...params } = spec;
        if (use === "sudoku") continue; // the grid and the regions above already imply it

        if (use === "killer") {
            if (params.distinct === false) {
                const cellsParam = params.cells as CellId[];
                const anchor = littleKillerAnchor(cellsParam);
                if (!anchor || typeof params.sum !== "number") {
                    warnings.push(
                        "the exporter skipped a littlekillersum with cells that are not a straight diagonal, or with no sum",
                    );
                    continue;
                }
                littlekillersumClues.push({
                    cell: anchor.cell,
                    direction: anchor.direction,
                    value: String(params.sum),
                });
                continue;
            }
            const cells = exportCells(params.cells as CellId[]);
            if (!cells) {
                warnings.push("the exporter skipped a killer cage with a non-grid cell id");
                continue;
            }
            cage.push({ cells, ...(typeof params.sum === "number" ? { value: String(params.sum) } : {}) });
        } else if (use === "thermometer") {
            const cells = exportCells(params.cells as CellId[]);
            if (!cells) {
                warnings.push("the exporter skipped a thermometer with a non-grid cell id");
                continue;
            }
            thermometer.push({ lines: [cells] });
        } else if (use === "arrow") {
            const bulbRaw = params.bulb;
            const bulbCells = Array.isArray(bulbRaw)
                ? (bulbRaw as CellId[])
                : typeof bulbRaw === "string"
                  ? [bulbRaw]
                  : [];
            const bulb = exportCells(bulbCells);
            const shaft = exportCells(params.cells as CellId[]);
            if (!bulb || !shaft) {
                warnings.push("the exporter skipped an arrow with a non-grid cell id");
                continue;
            }
            // The line has the bulb cell(s) as its leading entries.
            // A real f-puzzles export does the same (see the matching comment in the importer).
            arrow.push({ cells: bulb, lines: [[...bulb, ...shaft]] });
        } else if (use === "kropkiDifference" || use === "kropkiRatio") {
            const cells = exportCells(params.cells as CellId[]);
            if (!cells) {
                warnings.push(`the exporter skipped a ${use} with a non-grid cell id`);
                continue;
            }
            const value = typeof params.value === "number" ? String(params.value) : undefined;
            (use === "kropkiDifference" ? difference : ratio).push({ cells, ...(value ? { value } : {}) });
        } else if (use === "odd" || use === "even") {
            const raw =
                typeof params.cell === "string"
                    ? params.cell
                    : Array.isArray(params.cells)
                      ? (params.cells as unknown[])[0]
                      : undefined;
            const cell = typeof raw === "string" ? toFPuzzlesCell(raw) : undefined;
            if (!cell) {
                warnings.push(`the exporter skipped a ${use} marker with a non-grid cell id`);
                continue;
            }
            (use === "odd" ? odd : even).push({ cell });
        } else if (use === "minimum" || use === "maximum") {
            const raw =
                typeof params.cell === "string"
                    ? params.cell
                    : Array.isArray(params.cells)
                      ? (params.cells as unknown[])[0]
                      : undefined;
            const cell = typeof raw === "string" ? toFPuzzlesCell(raw) : undefined;
            if (!cell) {
                warnings.push(`the exporter skipped a ${use} marker with a non-grid cell id`);
                continue;
            }
            (use === "minimum" ? minimumClues : maximumClues).push({ cell });
        } else if (use === "antiknight" || use === "antiking" || use === "nonconsecutive" || use === "disjointgroups") {
            if (use === "antiknight") antiknightFlag = true;
            if (use === "antiking") antikingFlag = true;
            if (use === "nonconsecutive") nonconsecutiveFlag = true;
            if (use === "disjointgroups") disjointgroupsFlag = true;
        } else if (use === "palindrome") {
            const cells = exportCells(params.cells as CellId[]);
            if (!cells) {
                warnings.push("the exporter skipped a palindrome with a non-grid cell id");
                continue;
            }
            palindromeLines.push({ lines: [cells] });
        } else if (use === "clone") {
            const cells = exportCells(params.cells as CellId[]);
            const cloneCells = exportCells(params.cloneCells as CellId[]);
            if (!cells || !cloneCells) {
                warnings.push("the exporter skipped a clone with a non-grid cell id");
                continue;
            }
            cloneClues.push({ cells, cloneCells });
        } else if (use === "quadruple") {
            const cells = exportCells(params.cells as CellId[]);
            const values = Array.isArray(params.values) ? (params.values as number[]) : undefined;
            if (!cells || !values) {
                warnings.push("the exporter skipped a quadruple with a non-grid cell id or no values");
                continue;
            }
            quadrupleClues.push({ cells, values });
        } else if (use === "xv") {
            const cells = exportCells(params.cells as CellId[]);
            const marker = params.target === 10 ? "X" : params.target === 5 ? "V" : undefined;
            if (!cells || !marker) {
                warnings.push(
                    "the exporter skipped an xv marker with a non-grid cell id or a target it cannot represent",
                );
                continue;
            }
            xvClues.push({ cells, value: marker });
        } else if (use === "sandwich") {
            const cellsParam = params.cells as CellId[];
            const anchor = sandwichAnchor(cellsParam, size);
            if (!anchor || typeof params.sum !== "number") {
                warnings.push(
                    "the exporter skipped a sandwich with cells that are not a full row or column, or with no sum",
                );
                continue;
            }
            sandwichsumClues.push({ cell: anchor, value: String(params.sum) });
        } else if (use === "betweenline") {
            const cells = exportCells(params.cells as CellId[]);
            if (!cells) {
                warnings.push("the exporter skipped a betweenline with a non-grid cell id");
                continue;
            }
            betweenlineLines.push({ lines: [cells] });
        } else if (use === "negativeDifference" || use === "negativeRatio" || use === "negativeXV") {
            negativeKinds.add(use === "negativeDifference" ? "difference" : use === "negativeRatio" ? "ratio" : "xv");
        } else {
            warnings.push(
                `f-puzzles export cannot represent the constraint that uses definition "${use}". The exporter drops it`,
            );
        }
    }

    const data: FPuzzlesExport = {
        size,
        grid,
        title: def.metadata.title,
        ...(def.metadata.author ? { author: def.metadata.author } : {}),
        ...(def.metadata.description ? { ruleset: def.metadata.description } : {}),
        ...(cage.length > 0 ? { killercage: cage } : {}),
        ...(thermometer.length > 0 ? { thermometer } : {}),
        ...(arrow.length > 0 ? { arrow } : {}),
        ...(difference.length > 0 ? { difference } : {}),
        ...(ratio.length > 0 ? { ratio } : {}),
        ...(odd.length > 0 ? { odd } : {}),
        ...(even.length > 0 ? { even } : {}),
        ...(diagonalPlus ? { "diagonal+": true } : {}),
        ...(diagonalMinus ? { "diagonal-": true } : {}),
        ...(antiknightFlag ? { antiknight: true } : {}),
        ...(antikingFlag ? { antiking: true } : {}),
        ...(nonconsecutiveFlag ? { nonconsecutive: true } : {}),
        ...(disjointgroupsFlag ? { disjointgroups: true } : {}),
        ...(palindromeLines.length > 0 ? { palindrome: palindromeLines } : {}),
        ...(cloneClues.length > 0 ? { clone: cloneClues } : {}),
        ...(quadrupleClues.length > 0 ? { quadruple: quadrupleClues } : {}),
        ...(minimumClues.length > 0 ? { minimum: minimumClues } : {}),
        ...(maximumClues.length > 0 ? { maximum: maximumClues } : {}),
        ...(xvClues.length > 0 ? { xv: xvClues } : {}),
        ...(littlekillersumClues.length > 0 ? { littlekillersum: littlekillersumClues } : {}),
        ...(sandwichsumClues.length > 0 ? { sandwichsum: sandwichsumClues } : {}),
        ...(betweenlineLines.length > 0 ? { betweenline: betweenlineLines } : {}),
        ...(negativeKinds.size > 0 ? { negative: [...negativeKinds] } : {}),
    };

    if (def.solution) {
        const cells = geometry.cells;
        if (cells.every((c) => def.solution?.[c] !== undefined)) {
            data.solution = cells.map((c) => String(def.solution?.[c]));
        } else {
            warnings.push("the solution is incomplete. The exporter omits it");
        }
    }

    return { data, warnings };
};

/** The inverse of the share-link decoding in `importFPuzzles`.
 *  It uses lz-string `compressToBase64` and puts the result in the same `?load=` query param. */
export const encodeFPuzzlesShareLink = (data: FPuzzlesExport): string =>
    `https://f-puzzles.com/?load=${compressToBase64(JSON.stringify(data))}`;

/** SudokuPad reads the same f-puzzles JSON payload with the same lz-string compression.
 *  It uses its own URL scheme (`sudokupad.app/fpuzzles<data>`).
 *  The payload goes directly after the path. It is not a `?load=` query param.
 *  The export does not go through f-puzzles.com.
 *  This is not verified against the live site: sudokupad.app is not on the network allowlist of this sandbox.
 *  Check it against a real SudokuPad load before you rely on it. */
export const encodeSudokuPadShareLink = (data: FPuzzlesExport): string =>
    `https://sudokupad.app/fpuzzles${compressToBase64(JSON.stringify(data))}`;
