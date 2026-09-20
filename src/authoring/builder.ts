/**
 * A tiny fluent builder for puzzle artifacts — the "creator experience" seam.
 *
 * It produces a plain `PuzzleDefinition` (the same JSON you could type by hand),
 * so "publishing" is just `build()` followed by serialization. A full authoring
 * UI would sit on top of this; it is deliberately not one.
 *
 *   const artifact = PuzzleBuilder.create("my-puzzle", "My Puzzle")
 *       .grid(9, 9)
 *       .domain([1, 2, 3, 4, 5, 6, 7, 8, 9])
 *       .use("sudoku")
 *       .use("thermometer", { cells: ["r1c1", "r1c2", "r1c3"] })
 *       .visual({ kind: "text", at: "r5c5", text: "!" })
 *       .build();
 */

import type { CellId, GridGeometrySpec } from "@/runtime/geometry.ts";
import type {
    ConstraintSpec,
    PuzzleDefinition,
    PuzzleMetadata,
    VisualObject,
} from "@/runtime/puzzle.ts";
import type { Expr } from "@/runtime/expression.ts";
import { givensFromRows } from "@/puzzles/grid_text.ts";

export class PuzzleBuilder {
    private metadata: PuzzleMetadata;
    private geometrySpec: GridGeometrySpec = { type: "grid", width: 9, height: 9 };
    private values: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    private readonly givenMap: Record<CellId, number> = {};
    private readonly regionMap: Record<string, readonly CellId[]> = {};
    private readonly constraintList: ConstraintSpec[] = [];
    private readonly objectList: VisualObject[] = [];
    private solutionMap?: Record<CellId, number>;
    private presentationOpts: PuzzleDefinition["presentation"];

    private constructor(id: string, title: string) {
        this.metadata = { id, title };
    }

    static create(id: string, title: string): PuzzleBuilder {
        return new PuzzleBuilder(id, title);
    }

    describe(patch: Partial<PuzzleMetadata>): this {
        this.metadata = { ...this.metadata, ...patch };
        return this;
    }

    grid(width: number, height: number, boxes?: { boxWidth: number; boxHeight: number }): this {
        this.geometrySpec = { type: "grid", width, height, ...boxes };
        return this;
    }

    domain(values: readonly number[]): this {
        this.values = values;
        return this;
    }

    given(cell: CellId, value: number): this {
        this.givenMap[cell] = value;
        return this;
    }

    givensFromRows(rows: readonly string[]): this {
        Object.assign(this.givenMap, givensFromRows(rows));
        return this;
    }

    region(name: string, cells: readonly CellId[]): this {
        this.regionMap[name] = cells;
        return this;
    }

    /** Add a raw primitive constraint expression. */
    constraint(expr: Expr): this {
        this.constraintList.push(expr);
        return this;
    }

    /** Add a definition reference, e.g. use("killer", { cells: [...], sum: 20 }). */
    use(name: string, params: Readonly<Record<string, unknown>> = {}): this {
        this.constraintList.push({ use: name, ...params });
        return this;
    }

    visual(object: VisualObject): this {
        this.objectList.push(object);
        return this;
    }

    solution(map: Record<CellId, number>): this {
        this.solutionMap = map;
        return this;
    }

    solutionFromRows(rows: readonly string[]): this {
        this.solutionMap = givensFromRows(rows);
        return this;
    }

    presentation(opts: PuzzleDefinition["presentation"]): this {
        this.presentationOpts = opts;
        return this;
    }

    /** "Publish" the artifact. */
    build(): PuzzleDefinition {
        const def: PuzzleDefinition = {
            version: 1,
            metadata: this.metadata,
            geometry: this.geometrySpec,
            domain: { values: this.values },
            constraints: this.constraintList,
        };
        if (Object.keys(this.givenMap).length > 0) def.givens = this.givenMap;
        if (Object.keys(this.regionMap).length > 0) def.regions = this.regionMap;
        if (this.objectList.length > 0) def.objects = this.objectList;
        if (this.solutionMap) def.solution = this.solutionMap;
        if (this.presentationOpts) def.presentation = this.presentationOpts;
        return def;
    }
}
