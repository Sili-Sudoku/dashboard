/**
 * What the visual builder knows about the primitive operators: the label of each, what it
 * produces, and the kind of value that each of its slots takes. It is the primitive-layer counterpart of the
 * `schema` of a definition. It lets one generic editor build any expression the runtime
 * accepts, without a screen for each operator. `operators.test.ts` keeps it in step with the runtime's
 * own `OPERATORS` table: when you add an operator there, the test fails until you describe it here.
 */

/** What an operator produces, or what a slot takes. */
export type SlotKind =
    /** One number: a literal, a cell's value, or an operator that yields one. */
    | "num"
    /** A true/false rule. */
    | "bool"
    /** A group of cells (picked on the board, or a named region). */
    | "cells"
    /** A sequence of numbers: a group of cells (their values) or a `list`. */
    | "nums"
    /** Exactly one cell, picked on the board. */
    | "cell";

export interface SlotSpec {
    label: string;
    kind: SlotKind;
    /** The slot is evaluated once per cell of the previous slot. `$` stands for the value of that cell. */
    bindsEach?: boolean;
}

export interface OperatorSignature {
    name: string;
    label: string;
    /** Menu section: how the builder groups the operator when it offers a choice. */
    group: "Compare" | "Arithmetic" | "Counting" | "Cells" | "Order" | "Logic";
    returns: Exclude<SlotKind, "cells" | "cell">;
    args: readonly SlotSpec[];
    /** Extra arguments past `args` (variadic operators): their kind and the minimum number needed. */
    rest?: { label: string; kind: SlotKind; min: number };
    /** How it reads in a summary: "infix" puts the name between two or more arguments. */
    infix?: boolean;
}

const compare = (name: string, label: string): OperatorSignature => ({
    name,
    label,
    group: "Compare",
    returns: "bool",
    infix: true,
    args: [
        { label: "Left", kind: "num" },
        { label: "Right", kind: "num" },
    ],
});

const order = (name: string, label: string): OperatorSignature => ({
    name,
    label,
    group: "Order",
    returns: "bool",
    args: [{ label: "Along", kind: "nums" }],
});

export const OPERATOR_SIGNATURES: readonly OperatorSignature[] = [
    compare("==", "equals (=)"),
    compare("!=", "is not equal to (≠)"),
    compare("<", "is less than (<)"),
    compare("<=", "is at most (≤)"),
    compare(">", "is greater than (>)"),
    compare(">=", "is at least (≥)"),

    { name: "sum", label: "sum of", group: "Arithmetic", returns: "num", args: [{ label: "Numbers", kind: "nums" }] },
    {
        name: "+",
        label: "add (+)",
        group: "Arithmetic",
        returns: "num",
        infix: true,
        args: [],
        rest: { label: "Term", kind: "num", min: 2 },
    },
    {
        name: "*",
        label: "multiply (×)",
        group: "Arithmetic",
        returns: "num",
        infix: true,
        args: [],
        rest: { label: "Factor", kind: "num", min: 2 },
    },
    {
        name: "-",
        label: "subtract (−)",
        group: "Arithmetic",
        returns: "num",
        infix: true,
        args: [
            { label: "From", kind: "num" },
            { label: "Minus", kind: "num" },
        ],
    },
    {
        name: "value",
        label: "value of a cell",
        group: "Cells",
        returns: "num",
        args: [{ label: "Cell", kind: "cell" }],
    },
    {
        name: "list",
        label: "list of numbers",
        group: "Cells",
        returns: "nums",
        args: [],
        rest: { label: "Number", kind: "num", min: 1 },
    },

    {
        name: "count",
        label: "how many cells satisfy",
        group: "Counting",
        returns: "num",
        args: [
            { label: "Among", kind: "cells" },
            { label: "Where (use $ for the value of the cell)", kind: "bool", bindsEach: true },
        ],
    },
    {
        name: "countValue",
        label: "how many cells equal",
        group: "Counting",
        returns: "num",
        args: [
            { label: "Among", kind: "cells" },
            { label: "Value", kind: "num" },
        ],
    },

    {
        name: "allDifferent",
        label: "all different",
        group: "Order",
        returns: "bool",
        args: [{ label: "Cells", kind: "nums" }],
    },
    order("strictIncreasing", "strictly increasing"),
    order("strictDecreasing", "strictly decreasing"),
    order("increasing", "increasing (ties allowed)"),
    order("decreasing", "decreasing (ties allowed)"),
    {
        name: "adjacent",
        label: "are next to each other",
        group: "Cells",
        returns: "bool",
        args: [
            { label: "First cell", kind: "cell" },
            { label: "Second cell", kind: "cell" },
        ],
    },

    {
        name: "and",
        label: "all of",
        group: "Logic",
        returns: "bool",
        infix: true,
        args: [],
        rest: { label: "Rule", kind: "bool", min: 2 },
    },
    {
        name: "or",
        label: "any of",
        group: "Logic",
        returns: "bool",
        infix: true,
        args: [],
        rest: { label: "Rule", kind: "bool", min: 2 },
    },
    { name: "not", label: "not", group: "Logic", returns: "bool", args: [{ label: "Rule", kind: "bool" }] },
    {
        name: "implies",
        label: "if … then …",
        group: "Logic",
        returns: "bool",
        args: [
            { label: "If", kind: "bool" },
            { label: "Then", kind: "bool" },
        ],
    },
];

/** Operators that only write another operator in a different way, or that the builder expresses as a leaf. */
export const NOT_OFFERED: readonly string[] = ["cells", "region", "values", "distinct"];

const BY_NAME = new Map(OPERATOR_SIGNATURES.map((s) => [s.name, s]));

export const signatureOf = (name: string): OperatorSignature | undefined => BY_NAME.get(name);

/** The operators that can fill a slot of `kind`.
 *  A `cells` slot also takes a group of cells directly, not via an operator. */
export const operatorsFor = (kind: SlotKind): readonly OperatorSignature[] =>
    OPERATOR_SIGNATURES.filter((s) => s.returns === kind || (kind === "nums" && s.returns === "nums"));
