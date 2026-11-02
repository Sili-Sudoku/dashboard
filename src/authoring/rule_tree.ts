/**
 * The expression tree behind the visual builder's custom-rule editor (#127): a rule being built,
 * slot by slot, out of the runtime's primitive operators (see `operators.ts`). Pure data and pure
 * functions — the UI is a thin recursive view over it, and `toExpr` turns a finished tree into
 * exactly the `Expr` a hand-written constraint would be.
 *
 * A slot that hasn't been chosen yet is `null`. A path addresses a node by the argument indexes
 * leading down from the root (`[]` is the root itself).
 */

import {
    operatorsFor,
    signatureOf,
    type OperatorSignature,
    type SlotKind,
    type SlotSpec,
} from "@/authoring/operators.ts";
import type { Expr } from "@/runtime/expression.ts";

export type RuleNode =
    | { k: "op"; name: string; args: readonly (RuleNode | null)[] }
    | { k: "num"; value: number | undefined }
    /** A group of cells: picked on the board, or a named region/selector such as "row:0". */
    | { k: "cells"; cells: readonly string[]; selector: string }
    | { k: "cell"; cell: string | undefined }
    /** `$`: the value of the cell a `count` is looking at. */
    | { k: "each" };

export type Path = readonly number[];

export const ROOT_SLOT: SlotSpec = { label: "Rule", kind: "bool" };

export const newOp = (name: string): RuleNode => {
    const sig = signatureOf(name);
    if (!sig) throw new Error(`unknown operator "${name}"`);
    const count = sig.args.length + (sig.rest?.min ?? 0);
    return { k: "op", name, args: Array.from({ length: count }, () => null) };
};

/** An empty leaf for a slot that takes a literal / board pick (`null` when only an operator can fill it). */
export const leafFor = (kind: SlotKind): RuleNode | null => {
    switch (kind) {
        case "num":
            return { k: "num", value: undefined };
        case "cells":
        case "nums":
            return { k: "cells", cells: [], selector: "" };
        case "cell":
            return { k: "cell", cell: undefined };
        case "bool":
            return null;
    }
};

/** The spec for argument `index` of an operator: its declared slots first, then the repeating one. */
export const argSpec = (sig: OperatorSignature, index: number): SlotSpec =>
    sig.args[index] ??
    (sig.rest ? { label: `${sig.rest.label} ${index - sig.args.length + 1}`, kind: sig.rest.kind } : ROOT_SLOT);

export const getAt = (root: RuleNode | null, path: Path): RuleNode | null => {
    let node = root;
    for (const i of path) {
        if (!node || node.k !== "op") return null;
        node = node.args[i] ?? null;
    }
    return node;
};

/** What the slot at `path` accepts, or undefined if there's no such slot. */
export const specAt = (root: RuleNode | null, path: Path): SlotSpec | undefined => {
    if (path.length === 0) return ROOT_SLOT;
    const parent = getAt(root, path.slice(0, -1));
    if (!parent || parent.k !== "op") return undefined;
    const sig = signatureOf(parent.name);
    const index = path[path.length - 1] as number;
    return sig && index < parent.args.length ? argSpec(sig, index) : undefined;
};

/** A copy of the tree with the node at `path` replaced (an op replaced by another keeps nothing of the old). */
export const setAt = (root: RuleNode | null, path: Path, node: RuleNode | null): RuleNode | null => {
    if (path.length === 0) return node;
    if (!root || root.k !== "op") return root;
    const [head, ...rest] = path as [number, ...number[]];
    return {
        ...root,
        args: root.args.map((arg, i) => (i === head ? setAt(arg, rest, node) : arg)),
    };
};

/** Adds one more slot to a variadic operator (`and`, `+`, `list`...). */
export const addArg = (root: RuleNode | null, path: Path): RuleNode | null => {
    const node = getAt(root, path);
    if (!node || node.k !== "op" || !signatureOf(node.name)?.rest) return root;
    return setAt(root, path, { ...node, args: [...node.args, null] });
};

/** Takes slot `index` off a variadic operator, as long as it keeps the minimum it needs. */
export const removeArg = (root: RuleNode | null, path: Path, index: number): RuleNode | null => {
    const node = getAt(root, path);
    const sig = node && node.k === "op" ? signatureOf(node.name) : undefined;
    if (!node || node.k !== "op" || !sig?.rest) return root;
    if (index < sig.args.length || node.args.length <= sig.args.length + sig.rest.min) return root;
    return setAt(root, path, { ...node, args: node.args.filter((_, i) => i !== index) });
};

export const isComplete = (node: RuleNode | null): boolean => {
    if (!node) return false;
    switch (node.k) {
        case "op": {
            const sig = signatureOf(node.name);
            if (!sig) return false;
            return node.args.length >= sig.args.length + (sig.rest?.min ?? 0) && node.args.every(isComplete);
        }
        case "num":
            return typeof node.value === "number" && Number.isFinite(node.value);
        case "cells":
            return node.cells.length > 0 || node.selector.trim() !== "";
        case "cell":
            return !!node.cell;
        case "each":
            return true;
    }
};

/** The runtime expression for a finished tree. */
export const toExpr = (node: RuleNode): Expr => {
    switch (node.k) {
        case "op":
            return [node.name, ...node.args.map((a) => toExpr(a as RuleNode))];
        case "num":
            return node.value as number;
        case "cells":
            return node.selector.trim() !== "" ? ["cells", node.selector.trim()] : ["cells", [...node.cells]];
        case "cell":
            return node.cell as string;
        case "each":
            return "$";
    }
};

/** Whether `$` makes sense under this path: only inside the per-cell rule of a `count`. */
export const bindsEachAt = (root: RuleNode | null, path: Path): boolean => {
    for (let depth = 0; depth < path.length; depth++) {
        const parent = getAt(root, path.slice(0, depth));
        if (parent?.k !== "op") return false;
        const sig = signatureOf(parent.name);
        if (sig && argSpec(sig, path[depth] as number).bindsEach) return true;
    }
    return false;
};

// --- reading an expression back as text --------------------------------------------------

const SYMBOLS: Record<string, string> = { "==": "=", "!=": "≠", "<=": "≤", ">=": "≥", "*": "×", "-": "−" };

const cellList = (cells: readonly unknown[]): string =>
    cells.length <= 4 ? cells.join(", ") : `${cells[0]}…${cells[cells.length - 1]} (${cells.length} cells)`;

/** A short human reading of an expression, for the list of what's in the puzzle. */
export const describeExpr = (expr: Expr): string => {
    if (!Array.isArray(expr)) return String(expr);
    const [head, ...args] = expr as readonly Expr[];
    if (typeof head !== "string") return "(rule)";
    if (head === "cells" || head === "region" || head === "values") {
        const first = args[0];
        return Array.isArray(first) ? cellList(first) : args.length > 1 ? cellList(args) : String(first);
    }
    const sig = signatureOf(head);
    if (sig?.infix && args.length >= 2) {
        const symbol = SYMBOLS[head] ?? head;
        const sep = head === "and" || head === "or" ? ` ${head} ` : ` ${symbol} `;
        return args
            .map((a) => {
                const text = describeExpr(a);
                return Array.isArray(a) && signatureOf(String(a[0]))?.infix ? `(${text})` : text;
            })
            .join(sep);
    }
    return `${head}(${args.map(describeExpr).join(", ")})`;
};

export { operatorsFor };
