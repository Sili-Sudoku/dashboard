/**
 * The serializable puzzle artifact and its compiled form.
 *
 * `PuzzleDefinition` is what an author writes, stores in a database, embeds in a
 * URL, or ships as a file. It is pure data, independent of React and of the
 * renderer. `CompiledPuzzle` is what the runtime works with after selectors are
 * resolved and variant definitions are expanded to primitive constraints.
 */

import type { CellId, GridGeometrySpec } from "@/runtime/geometry.ts";
import type { Expr } from "@/runtime/expression.ts";

export const PUZZLE_FORMAT_VERSION = 1 as const;

export interface PuzzleMetadata {
    id: string;
    title: string;
    author?: string;
    description?: string;
    difficulty?: string;
    tags?: readonly string[];
}

/** Style hints for visual objects. All optional; the renderer supplies defaults. */
export interface VisualStyle {
    stroke?: string;
    fill?: string;
    strokeWidth?: number;
    dashed?: boolean;
    opacity?: number;
    /** Draw order within its layer; higher is on top. */
    z?: number;
}

/** A point referenced by a visual object: a cell centre, a cell corner, or raw grid coords. */
export type PointRef =
    | CellId
    | { cell: CellId; corner: "tl" | "tr" | "bl" | "br" | "c" }
    | { x: number; y: number };

/**
 * Generic visual primitives. The renderer knows how to draw each `kind`; it does
 * not know what a thermometer or a cage is. A definition attaches whichever of
 * these it needs to express its own semantics visually.
 */
export type VisualObject =
    | { id?: string; kind: "line"; points: readonly PointRef[]; arrow?: boolean; style?: VisualStyle }
    | { id?: string; kind: "path"; cells: readonly CellId[]; style?: VisualStyle }
    | { id?: string; kind: "polygon"; points: readonly PointRef[]; style?: VisualStyle }
    | { id?: string; kind: "circle"; at: PointRef; r: number; style?: VisualStyle }
    | { id?: string; kind: "rect"; at: PointRef; w: number; h: number; style?: VisualStyle }
    | { id?: string; kind: "text"; at: PointRef; text: string; style?: VisualStyle & { fontSize?: number; bold?: boolean } }
    | { id?: string; kind: "region"; cells: readonly CellId[]; style?: VisualStyle }
    | {
          id?: string;
          kind: "cage";
          cells: readonly CellId[];
          label?: string;
          style?: VisualStyle;
      };

/**
 * A constraint the author wrote. Either a raw primitive expression, or a
 * reference to a definition (`use`) with parameters that compile to primitives.
 */
export type ConstraintSpec =
    | Expr
    | {
          use: string;
          /** Free-form parameters passed to the definition. */
          [param: string]: unknown;
      };

export const isDefinitionRef = (spec: ConstraintSpec): spec is { use: string; [k: string]: unknown } =>
    typeof spec === "object" && spec !== null && !Array.isArray(spec) && typeof (spec as { use?: unknown }).use === "string";

export interface PuzzleDefinition {
    version: typeof PUZZLE_FORMAT_VERSION;
    metadata: PuzzleMetadata;
    geometry: GridGeometrySpec;
    /** Allowed cell values. For classic Sudoku: [1..9]. */
    domain: { values: readonly number[] };
    /** Named cell groups referenced by selectors, e.g. "cage:A". */
    regions?: Readonly<Record<string, readonly CellId[]>>;
    /** Fixed clues: cell id -> value. */
    givens?: Readonly<Record<CellId, number>>;
    /** Author-declared visual objects (definitions may add more). */
    objects?: readonly VisualObject[];
    /** Constraints: primitive expressions and/or definition references. */
    constraints: readonly ConstraintSpec[];
    /** Optional full solution, for authoring tools and hints. */
    solution?: Readonly<Record<CellId, number>>;
    presentation?: {
        /** Pixels per geometry unit hint for the renderer. */
        cellSize?: number;
        theme?: string;
    };
}

/** A single primitive constraint after compilation. */
export interface CompiledConstraint {
    id: string;
    expr: Expr;
    /** Cells this constraint reads, for highlighting and incremental evaluation. */
    cells: readonly CellId[];
    /** Which definition produced it (or "primitive" for hand-written exprs). */
    source: string;
    label?: string;
}

export interface CompiledPuzzle {
    metadata: PuzzleMetadata;
    geometry: GridGeometrySpec;
    domain: readonly number[];
    regions: Readonly<Record<string, readonly CellId[]>>;
    givens: Readonly<Record<CellId, number>>;
    objects: readonly VisualObject[];
    constraints: readonly CompiledConstraint[];
    solution?: Readonly<Record<CellId, number>>;
    presentation: NonNullable<PuzzleDefinition["presentation"]>;
}
