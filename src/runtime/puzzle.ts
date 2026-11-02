/**
 * The serializable puzzle artifact and its compiled form.
 *
 * `PuzzleDefinition` is what an author writes, stores in a database, embeds in a URL, or ships as a file.
 * It is pure data. It does not depend on React or on the renderer.
 * `CompiledPuzzle` is what the runtime uses after it resolves the selectors
 * and expands the variant definitions to primitive constraints.
 */

import type { CellId, GeometrySpec } from "@/runtime/geometry.ts";
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

export const PATTERNS = ["stripes", "dots", "checks", "crosshatch"] as const;
export type PatternName = (typeof PATTERNS)[number];

/** Style hints for visual objects. All are optional. The renderer supplies defaults. */
export interface VisualStyle {
    stroke?: string;
    fill?: string;
    strokeWidth?: number;
    dashed?: boolean;
    opacity?: number;
    /** Draw order within its layer. A higher value is on top. */
    z?: number;
    /** Fill closed shapes (and paint lines) with a repeating pattern in the color of the shape. */
    pattern?: PatternName;
    /** Fill with a picture (an https:, data:image/ or site-relative URL), cropped to cover the shape. */
    image?: string;
}

/** A point that a visual object references: a cell center, a cell corner, or raw grid coordinates. */
export type PointRef =
    | CellId
    | { cell: CellId; corner: "tl" | "tr" | "bl" | "br" | "c" }
    | { x: number; y: number };

/**
 * Generic visual primitives.
 * The renderer knows how to draw each `kind`.
 * It does not know what a thermometer or a cage is.
 * A definition attaches the primitives that it needs to show its own semantics.
 */
export type VisualObject =
    | {
          id?: string;
          kind: "line";
          points: readonly PointRef[];
          arrow?: boolean;
          /** Cell units to cut off each end of the line, measured along it.
           *  Example: an arrow shaft starts at the rim of its bulb, and its head stops before the last digit. */
          trim?: { start?: number; end?: number };
          style?: VisualStyle;
      }
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
 * A constraint that the author wrote.
 * It is a raw primitive expression, or a reference to a definition (`use`)
 * with parameters that compile to primitives.
 */
export type ConstraintSpec =
    | Expr
    | NamedRule
    | {
          use: string;
          /** Free-form parameters for the definition. */
          [param: string]: unknown;
      };

/** A primitive expression with a name that the author chooses: `{ "rule": [...], "name": "German whispers" }`. */
export interface NamedRule {
    rule: Expr;
    name?: string;
}

export const isNamedRule = (spec: ConstraintSpec): spec is NamedRule =>
    typeof spec === "object" && spec !== null && !Array.isArray(spec) && !isDefinitionRef(spec) && "rule" in spec;

/**
 * The object ids that a visual object answers to.
 * The objects of a definition carry the ids of their constraints, joined by commas.
 */
export const objectIds = (o: VisualObject): readonly string[] => (o.id ? o.id.split(",") : []);

export const isDefinitionRef = (spec: ConstraintSpec): spec is { use: string; [k: string]: unknown } =>
    typeof spec === "object" && spec !== null && !Array.isArray(spec) && typeof (spec as { use?: unknown }).use === "string";

/**
 * A dynamic rule (#72).
 * `when` is an ordinary expression over the current board (the same language as constraints).
 * `then` says what holds while `when` is definitely true.
 * The rule stores nothing. Each effect is a function of the board at that time.
 * So undo, reload, and share links need no extra state.
 * A rule switches off again if the board stops satisfying it.
 */
export interface PuzzleRule {
    /** Optional name, for error messages. */
    id?: string;
    when: Expr;
    then: {
        /** Cells (ids or region selectors) that stay hidden, as under fog, until this rule holds. */
        reveal?: readonly string[];
        /**
         * Cells (ids or region selectors) that are not on the board until this rule holds.
         * The renderer does not draw them, the player cannot select them, and no grid lines surround them.
         * Example: a 4x3 board that grows a fourth row.
         */
        appear?: readonly string[];
        /** Visual objects (by `id`) drawn only while the rule holds. */
        show?: readonly string[];
        /** Visual objects drawn except while the rule holds. */
        hide?: readonly string[];
        /** Constraints enforced only while the rule holds. Use the compiled id (`killer#2`) or name. */
        enable?: readonly string[];
        /** Constraints that the puzzle enforces except while the rule holds. */
        disable?: readonly string[];
    };
}

/** A rule after compilation. `enable`/`disable` are already part of the constraints. */
export interface CompiledRule {
    id: string;
    when: Expr;
    cells: readonly CellId[];
    reveal: readonly CellId[];
    appear: readonly CellId[];
    show: readonly string[];
    hide: readonly string[];
}

export interface PuzzleDefinition {
    version: typeof PUZZLE_FORMAT_VERSION;
    metadata: PuzzleMetadata;
    geometry: GeometrySpec;
    /** Allowed cell values. For classic Sudoku: [1..9]. */
    domain: { values: readonly number[] };
    /** Named cell groups that selectors reference, for example "cage:A". */
    regions?: Readonly<Record<string, readonly CellId[]>>;
    /** Fixed clues: cell id -> value. */
    givens?: Readonly<Record<CellId, number>>;
    /**
     * Cells hidden at the start.
     * They are revealed when the player (or an adjacent cell) solves them correctly. See `src/runtime/fog.ts`.
     * Requires `solution`, because "correctly" is defined against it.
     */
    fog?: { hidden: readonly CellId[] };
    /** Dynamic rules: effects that depend on the current state of the board. See `PuzzleRule`. */
    rules?: readonly PuzzleRule[];
    /** Visual objects that the author declares (definitions can add more). */
    objects?: readonly VisualObject[];
    /** Constraints: primitive expressions and/or definition references. */
    constraints: readonly ConstraintSpec[];
    /** Optional full solution, for authoring tools and hints. */
    solution?: Readonly<Record<CellId, number>>;
    presentation?: {
        /** Hint for the renderer: pixels per geometry unit. */
        cellSize?: number;
        theme?: string;
    };
}

/** A single primitive constraint after compilation. */
export interface CompiledConstraint {
    id: string;
    expr: Expr;
    /** Cells that this constraint reads, for highlighting and incremental evaluation. */
    cells: readonly CellId[];
    /** The definition that produced it (or "primitive" for hand-written exprs). */
    source: string;
    label?: string;
}

export interface CompiledPuzzle {
    metadata: PuzzleMetadata;
    geometry: GeometrySpec;
    domain: readonly number[];
    regions: Readonly<Record<string, readonly CellId[]>>;
    givens: Readonly<Record<CellId, number>>;
    fog?: { hidden: readonly CellId[] };
    rules: readonly CompiledRule[];
    objects: readonly VisualObject[];
    constraints: readonly CompiledConstraint[];
    solution?: Readonly<Record<CellId, number>>;
    presentation: NonNullable<PuzzleDefinition["presentation"]>;
}
