/**
 * The serializable puzzle artifact and its compiled form.
 *
 * `PuzzleDefinition` is what an author writes, stores in a database, embeds in a
 * URL, or ships as a file. It is pure data, independent of React and of the
 * renderer. `CompiledPuzzle` is what the runtime works with after selectors are
 * resolved and variant definitions are expanded to primitive constraints.
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
    | {
          id?: string;
          kind: "line";
          points: readonly PointRef[];
          arrow?: boolean;
          /** Cell units to cut off each end of the line, measured along it — e.g. so an arrow's
           *  shaft starts at its bulb's rim and its head stops short of the last digit. */
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
 * A constraint the author wrote. Either a raw primitive expression, or a
 * reference to a definition (`use`) with parameters that compile to primitives.
 */
export type ConstraintSpec =
    | Expr
    | NamedRule
    | {
          use: string;
          /** Free-form parameters passed to the definition. */
          [param: string]: unknown;
      };

/** A primitive expression with a name of the author's choosing: `{ "rule": [...], "name": "German whispers" }`. */
export interface NamedRule {
    rule: Expr;
    name?: string;
}

export const isNamedRule = (spec: ConstraintSpec): spec is NamedRule =>
    typeof spec === "object" && spec !== null && !Array.isArray(spec) && !isDefinitionRef(spec) && "rule" in spec;

/** The object ids a visual object answers to (a definition's objects carry the ids of their constraints, comma-joined). */
export const objectIds = (o: VisualObject): readonly string[] => (o.id ? o.id.split(",") : []);

export const isDefinitionRef = (spec: ConstraintSpec): spec is { use: string; [k: string]: unknown } =>
    typeof spec === "object" && spec !== null && !Array.isArray(spec) && typeof (spec as { use?: unknown }).use === "string";

/**
 * A dynamic rule (#72): `when` is an ordinary expression over the current board (the same language
 * as constraints), and `then` says what holds while it is definitely true. Nothing is stored: every
 * effect is a function of the board right now, so undo, reload and share links need no extra state,
 * and a rule switches back off if the board stops satisfying it.
 */
export interface PuzzleRule {
    /** Optional name, for error messages. */
    id?: string;
    when: Expr;
    then: {
        /** Cells (ids or region selectors) that stay hidden, as under fog, until this rule holds. */
        reveal?: readonly string[];
        /**
         * Cells (ids or region selectors) that are not on the board at all until this rule holds: not
         * drawn, not selectable, no grid lines around them. A 4x3 board that grows a fourth row.
         */
        appear?: readonly string[];
        /** Visual objects (by `id`) drawn only while the rule holds. */
        show?: readonly string[];
        /** Visual objects drawn except while the rule holds. */
        hide?: readonly string[];
        /** Constraints (by compiled id such as `killer#2`, or by source/name) enforced only while the rule holds. */
        enable?: readonly string[];
        /** Constraints enforced except while the rule holds. */
        disable?: readonly string[];
    };
}

/** A rule after compilation: `enable`/`disable` are already folded into the constraints themselves. */
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
    /** Named cell groups referenced by selectors, e.g. "cage:A". */
    regions?: Readonly<Record<string, readonly CellId[]>>;
    /** Fixed clues: cell id -> value. */
    givens?: Readonly<Record<CellId, number>>;
    /**
     * Cells hidden at the start, revealed as the player (or an adjacent cell)
     * solves them correctly — see `src/runtime/fog.ts`. Requires `solution`,
     * since "correctly" is defined against it.
     */
    fog?: { hidden: readonly CellId[] };
    /** Dynamic rules: effects that depend on the board's current state — see `PuzzleRule`. */
    rules?: readonly PuzzleRule[];
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
