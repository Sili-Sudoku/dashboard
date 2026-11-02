import { X } from "lucide-react";

import { OverflowMenu, type MenuItem } from "@/app/overflow_menu.tsx";

import { OPERATOR_SIGNATURES, signatureOf, type SlotSpec } from "@/authoring/operators.ts";
import { addArg, argSpec, bindsEachAt, getAt, leafFor, newOp, removeArg, type Path } from "@/authoring/rule_tree.ts";
import type { RuleControls } from "@/features/author/use_visual_builder.ts";

/** The operators that a slot of this kind can hold, in groups for the picker. */
const choicesFor = (spec: SlotSpec) => {
    const returns = spec.kind === "nums" ? ["nums"] : [spec.kind];
    const groups = new Map<string, { name: string; label: string }[]>();
    for (const sig of OPERATOR_SIGNATURES.filter((s) => returns.includes(s.returns))) {
        groups.set(sig.group, [...(groups.get(sig.group) ?? []), sig]);
    }
    return groups;
};

const samePath = (a: Path, b: Path) => a.length === b.length && a.every((x, i) => x === b[i]);

interface SlotProps {
    rule: RuleControls;
    path: Path;
    spec: SlotSpec;
}

export function Slot({ rule, path, spec }: SlotProps) {
    const node = getAt(rule.tree, path);
    const here = samePath(rule.path, path);

    if (!node) {
        const leaf = leafFor(spec.kind);
        const groups = choicesFor(spec);
        const leafLabel =
            spec.kind === "num" ? "A number" : spec.kind === "cell" ? "A cell from the board" : "Cells from the board";
        const items: MenuItem[] = [
            ...(leaf ? [{ label: leafLabel, onSelect: (): void => rule.set(path, leaf) }] : []),
            ...(spec.kind === "num" && bindsEachAt(rule.tree, path)
                ? [{ label: "$ (the cell being checked)", onSelect: () => rule.set(path, { k: "each" } as const) }]
                : []),
            ...[...groups].flatMap(([group, ops]) => [
                { label: group, info: true, onSelect: (): void => undefined },
                ...ops.map((o) => ({ label: o.label, onSelect: (): void => rule.set(path, newOp(o.name)) })),
            ]),
        ];
        return <OverflowMenu label={spec.label} text="Choose…" align="start" items={items} />;
    }

    const clear = (
        <button
            type="button"
            className="rule-clear"
            aria-label={`Clear ${spec.label}`}
            onClick={() => rule.set(path, null)}
        >
            <X size={12} />
        </button>
    );

    switch (node.k) {
        case "num":
            return (
                <span className="rule-leaf">
                    <input
                        type="number"
                        aria-label={spec.label}
                        value={node.value ?? ""}
                        onChange={(e) =>
                            rule.set(path, {
                                k: "num",
                                value: e.target.value === "" ? undefined : Number(e.target.value),
                            })
                        }
                    />
                    {clear}
                </span>
            );
        case "each":
            return (
                <span className="rule-leaf">
                    <span>$ (the cell being checked)</span>
                    {clear}
                </span>
            );
        case "cell":
            return (
                <span className="rule-leaf">
                    <button
                        type="button"
                        className={`visual-builder-cell-field ${here ? "active" : ""}`}
                        onClick={() => rule.setPath(path)}
                    >
                        <span className="visual-builder-cell-field-label">{spec.label}:</span>
                        <span className="visual-builder-cell-field-value">{node.cell ?? "(click on the board)"}</span>
                    </button>
                    {clear}
                </span>
            );
        case "cells":
            return (
                <span className="rule-leaf">
                    <button
                        type="button"
                        className={`visual-builder-cell-field ${here ? "active" : ""}`}
                        onClick={() => rule.setPath(path)}
                    >
                        <span className="visual-builder-cell-field-label">{spec.label}:</span>
                        <span className="visual-builder-cell-field-value">
                            {node.selector.trim() !== ""
                                ? node.selector
                                : node.cells.length > 0
                                  ? node.cells.join(", ")
                                  : "(drag on the board)"}
                        </span>
                    </button>
                    <input
                        type="text"
                        aria-label={`${spec.label} region`}
                        placeholder="or a region, for example row:0"
                        value={node.selector}
                        onChange={(e) => rule.set(path, { ...node, selector: e.target.value })}
                    />
                    {clear}
                </span>
            );
        case "op": {
            const sig = signatureOf(node.name);
            if (!sig) return null;
            const min = sig.args.length + (sig.rest?.min ?? 0);
            return (
                <div className="rule-op">
                    <div className="rule-op-head">
                        <strong>{sig.label}</strong>
                        {clear}
                    </div>
                    <ul className="rule-args">
                        {node.args.map((_, i) => {
                            const childSpec = argSpec(sig, i);
                            const removable = i >= sig.args.length && node.args.length > min;
                            return (
                                <li key={i}>
                                    <span className="rule-arg-label">{childSpec.label}</span>
                                    <Slot rule={rule} path={[...path, i]} spec={childSpec} />
                                    {removable && (
                                        <button
                                            type="button"
                                            className="rule-clear"
                                            aria-label={`Remove ${childSpec.label}`}
                                            onClick={() => rule.replace(removeArg(rule.tree, path, i))}
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    {sig.rest && (
                        <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => rule.replace(addArg(rule.tree, path))}
                        >
                            Add another {sig.rest.label.toLowerCase()}
                        </button>
                    )}
                </div>
            );
        }
    }
}

/** The recursive slot editor for a custom rule (#127). The author picks an operator, then fills each of its slots. */
export default function RuleEditor({ rule }: { rule: RuleControls }) {
    return (
        <div className="visual-builder-form rule-editor" aria-label="Custom rule">
            <p className="author-hint">
                Build a rule from parts. Pick what it checks, then fill each slot. Cell slots use the cells that you
                select on the board.
            </p>
            <label className="visual-builder-param">
                Name
                <input
                    type="text"
                    placeholder="for example German whispers (optional)"
                    value={rule.name}
                    onChange={(e) => rule.setName(e.target.value)}
                />
            </label>
            <Slot rule={rule} path={[]} spec={{ label: "Rule", kind: "bool" }} />
            <div className="visual-builder-actions">
                <button type="button" className="btn btn-sm btn-primary" disabled={!rule.complete} onClick={rule.add}>
                    Add rule
                </button>
            </div>
        </div>
    );
}
