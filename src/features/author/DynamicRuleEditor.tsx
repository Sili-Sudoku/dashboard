import { useState } from "react";
import { X } from "lucide-react";

import { OverflowMenu } from "@/app/overflow_menu.tsx";

import type { PuzzleRule } from "@/runtime/puzzle.ts";
import { Slot } from "@/features/author/RuleEditor.tsx";
import type { RuleControls } from "@/features/author/use_visual_builder.ts";

type Effect = keyof PuzzleRule["then"];
type Targets = Partial<Record<Effect, string[]>>;

const EFFECTS: { effect: Effect; label: string; hint: string }[] = [
    { effect: "reveal", label: "Reveal cells", hint: "Cells stay hidden, as with fog, until the rule holds." },
    { effect: "appear", label: "Add cells to the board", hint: "Cells are not on the board until the rule holds." },
    { effect: "show", label: "Show objects", hint: "Objects show only while the rule holds (object ids)." },
    { effect: "hide", label: "Hide objects", hint: "Objects are hidden while the rule holds (object ids)." },
    { effect: "enable", label: "Enforce constraints", hint: "Constraints are not enforced until the rule holds." },
    { effect: "disable", label: "Stop enforcing constraints", hint: "Constraints are not enforced while the rule holds." },
];

const CELL_EFFECTS: readonly Effect[] = ["reveal", "appear"];
const CONSTRAINT_EFFECTS: readonly Effect[] = ["enable", "disable"];

interface Props {
    rule: RuleControls;
    /** Names of the constraints in the puzzle, for the enable and disable effects. */
    constraintNames: readonly string[];
    onAdd: (then: PuzzleRule["then"]) => void;
}

/** One effect. It shows its targets as chips that the author can remove, and a control to add more. */
function EffectEditor({
    effect,
    targets,
    rule,
    constraintNames,
    onChange,
}: {
    effect: (typeof EFFECTS)[number];
    targets: readonly string[];
    rule: RuleControls;
    constraintNames: readonly string[];
    onChange: (targets: string[] | undefined) => void;
}) {
    const [text, setText] = useState("");
    const add = (...more: string[]): void => {
        const fresh = more.map((m) => m.trim()).filter((m) => m !== "" && !targets.includes(m));
        if (fresh.length > 0) onChange([...targets, ...fresh]);
    };
    const commitText = (): void => {
        add(...text.split(","));
        setText("");
    };
    const isCells = CELL_EFFECTS.includes(effect.effect);
    const names = [...new Set(constraintNames)].filter((n) => !targets.includes(n));
    return (
        <div className="rule-effect">
            <div className="rule-op-head">
                <strong>{effect.label}</strong>
                <button
                    type="button"
                    className="rule-clear"
                    aria-label={`Remove ${effect.label}`}
                    onClick={() => onChange(undefined)}
                >
                    <X size={12} />
                </button>
            </div>
            <p className="author-hint">{effect.hint}</p>
            {targets.length > 0 && (
                <ul className="rule-targets">
                    {targets.map((t) => (
                        <li key={t}>
                            <span>{t}</span>
                            <button
                                type="button"
                                className="rule-clear"
                                aria-label={`Remove ${t}`}
                                onClick={() => onChange(targets.filter((x) => x !== t))}
                            >
                                <X size={12} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <div className="style-editor-row">
                {CONSTRAINT_EFFECTS.includes(effect.effect) ? (
                    <OverflowMenu
                        label={`${effect.label}: pick a constraint`}
                        text="Pick a constraint…"
                        align="start"
                        flat
                        items={
                            names.length > 0
                                ? names.map((n) => ({ label: n, onSelect: (): void => add(n) }))
                                : [{ label: "No more constraints", info: true, onSelect: (): void => undefined }]
                        }
                    />
                ) : (
                    <input
                        type="text"
                        aria-label={`${effect.label}: ${isCells ? "cells or regions" : "object ids"}`}
                        placeholder={isCells ? "for example row:3 or r4c1" : "object id"}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                commitText();
                            }
                        }}
                    />
                )}
                {!CONSTRAINT_EFFECTS.includes(effect.effect) && (
                    <button type="button" className="btn btn-sm" disabled={text.trim() === ""} onClick={commitText}>
                        Add
                    </button>
                )}
                {isCells && (
                    <button
                        type="button"
                        className="btn btn-sm"
                        disabled={rule.selected.length === 0}
                        onClick={() => add(...rule.selected)}
                    >
                        Use selected cells
                    </button>
                )}
            </div>
        </div>
    );
}

/** The when/then editor for a dynamic rule (#167). The condition uses the custom-rule slot editor (#127). */
export default function DynamicRuleEditor({ rule, constraintNames, onAdd }: Props) {
    const [targets, setTargets] = useState<Targets>({});
    const chosen = EFFECTS.filter((e) => targets[e.effect] !== undefined);
    const ready = rule.complete && chosen.some((e) => (targets[e.effect]?.length ?? 0) > 0);
    const setEffect = (effect: Effect, value: string[] | undefined): void =>
        setTargets((t) => {
            const next = { ...t };
            if (value === undefined) delete next[effect];
            else next[effect] = value;
            return next;
        });
    const add = (): void => {
        const then: PuzzleRule["then"] = {};
        for (const e of chosen) {
            const list = targets[e.effect] ?? [];
            if (list.length > 0) then[e.effect] = list;
        }
        onAdd(then);
        setTargets({});
    };
    return (
        <div className="visual-builder-form rule-editor" aria-label="Dynamic rule">
            <p className="author-hint">
                A rule that changes the puzzle as the solver solves it. When the condition holds on the board, the
                effects apply. When it stops, the effects switch off.
            </p>
            <label className="visual-builder-param">
                Name
                <input
                    type="text"
                    placeholder="for example unlock-bottom (optional)"
                    value={rule.name}
                    onChange={(e) => rule.setName(e.target.value)}
                />
            </label>
            <div className="rule-effect">
                <strong>When</strong>
                <Slot rule={rule} path={[]} spec={{ label: "Condition", kind: "bool" }} />
            </div>
            {chosen.map((e) => (
                <EffectEditor
                    key={e.effect}
                    effect={e}
                    targets={targets[e.effect] ?? []}
                    rule={rule}
                    constraintNames={constraintNames}
                    onChange={(value) => setEffect(e.effect, value)}
                />
            ))}
            {chosen.length < EFFECTS.length && (
                <OverflowMenu
                    label="Add effect"
                    text="Then… add an effect"
                    align="start"
                    items={EFFECTS.filter((e) => targets[e.effect] === undefined).map((e) => ({
                        label: e.label,
                        onSelect: (): void => setEffect(e.effect, []),
                    }))}
                />
            )}
            <div className="visual-builder-actions">
                <button type="button" className="btn btn-sm btn-primary" disabled={!ready} onClick={add}>
                    Add dynamic rule
                </button>
            </div>
        </div>
    );
}
