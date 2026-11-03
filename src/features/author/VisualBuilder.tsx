import { useState } from "react";
import { Palette, X } from "lucide-react";

import { OverflowMenu, type MenuItem } from "@/app/overflow_menu.tsx";

import {
    AUTHORING_SCHEMAS,
    isSchemaComplete,
    summarizeConstraint,
    type AuthoringField,
    type AuthoringSchema,
} from "@/authoring/schema.ts";
import { describeExpr } from "@/authoring/rule_tree.ts";
import { isDefinitionRef, type PuzzleDefinition, type PuzzleRule } from "@/runtime/puzzle.ts";
import { drawsObjects } from "@/authoring/style_override.ts";
import StyleEditor from "@/features/author/StyleEditor.tsx";
import DynamicRuleEditor from "@/features/author/DynamicRuleEditor.tsx";
import RuleEditor from "@/features/author/RuleEditor.tsx";
import {
    DYNAMIC_TOOL,
    FOG_TOOL,
    RULE_TOOL,
    isGlobalPlaced, type VisualBuilderState,
} from "@/features/author/use_visual_builder.ts";

interface Props {
    def: PuzzleDefinition | undefined;
    state: VisualBuilderState;
}

/** The sections of the palette, by what the author places: a path, a mark on cells, or a rule for the whole grid. */
const PALETTE_GROUPS: { title: string; names: string[] }[] = [
    {
        title: "Lines & regions",
        names: ["thermometer", "arrow", "killer", "palindrome", "betweenline", "clone", "sandwich", "quadruple"],
    },
    { title: "Cell marks", names: ["kropkiDifference", "kropkiRatio", "odd", "even", "minimum", "maximum", "xv"] },
    { title: "Whole grid", names: ["sudoku", "antiknight", "antiking", "nonconsecutive", "disjointgroups"] },
    { title: "Hidden cells", names: [FOG_TOOL] },
    { title: "Custom", names: [RULE_TOOL, DYNAMIC_TOOL] },
];

/** All tools of the palette: each definition with a builder schema, and fog (which edits the puzzle itself). */
interface PaletteTool {
    name: string;
    label: string;
}
const FOG_ENTRY: PaletteTool = { name: FOG_TOOL, label: "Fog" };
const RULE_ENTRY: PaletteTool = { name: RULE_TOOL, label: "Custom rule" };
const DYNAMIC_ENTRY: PaletteTool = { name: DYNAMIC_TOOL, label: "Dynamic rule" };

/** One line for a dynamic rule: its name, its condition, and its effect. */
const summarizeRule = (r: PuzzleRule): string => {
    const effects = Object.entries(r.then)
        .filter(([, v]) => v && v.length > 0)
        .map(([k, v]) => `${k} ${(v as readonly string[]).join(", ")}`)
        .join("; ");
    return `${r.id ? `${r.id}: ` : ""}when ${describeExpr(r.when)} → ${effects}`;
};

/** Visual drag-and-drop puzzle authoring.
 *  It has a palette of definitions, a small param form for each definition,
 *  and a list of the constraints that the author already placed.
 *  It does not render its own board. The author picks a definition, then clicks or drags
 *  on the one PuzzlePlayer board of the Author page to place it.
 *  The board uses its normal click, drag and shift-click selection.
 *  The highlighted field below mirrors that selection live (see use_visual_builder.ts).
 *  Only one board is on screen. There is no second board for this component.
 *  It covers only the definitions that have an AUTHORING_SCHEMAS entry.
 *  The JSON tab still gives access to all other definitions.
 *  The rule is the same as for the f-puzzles importer: cover the common types and never
 *  silently drop the rest. */
export default function VisualBuilder({ def, state }: Props) {
    const {
        fog,
        rule,
        activeSchema,
        activeFieldKey,
        fieldValues,
        startPlacing,
        cancelPlacing,
        setField,
        setActiveField,
        addConstraint,
        removeConstraint,
        removeRule,
        updateConstraint,
        removeTool,
    } = state;

    // The placed constraint that has its colour and style panel open.
    const [styling, setStyling] = useState<number | null>(null);

    if (!def) {
        return (
            <p className="author-notice">
                Fix the JSON errors in the JSON tab to use the visual builder.
            </p>
        );
    }

    // Quick access has the tools that the author pinned and the tools that the JSON of the puzzle already uses.
    // The "Add tool" dropdown has all other tools.
    const pinned = new Set(state.tools);
    const used = new Set([
        ...def.constraints.flatMap((c) => (isDefinitionRef(c) ? [c.use] : [RULE_TOOL])),
        ...(def.fog ? [FOG_TOOL] : []),
        ...(def.rules?.length ? [DYNAMIC_TOOL] : []),
    ]);
    const tools: PaletteTool[] = [...AUTHORING_SCHEMAS, FOG_ENTRY, RULE_ENTRY, DYNAMIC_ENTRY];
    const isQuick = (tool: PaletteTool) => pinned.has(tool.name) || used.has(tool.name);
    const hidden = tools.filter((tool) => !isQuick(tool));
    const quickCount = tools.length - hidden.length;
    const isFog = (tool: PaletteTool) => tool.name === FOG_TOOL;
    const startTool = (tool: PaletteTool) => {
        if (isFog(tool)) fog.start();
        else if (tool.name === RULE_TOOL) rule.start("constraint");
        else if (tool.name === DYNAMIC_TOOL) rule.start("dynamic");
        else startPlacing(AUTHORING_SCHEMAS.find((s) => s.name === tool.name) as AuthoringSchema);
    };
    // The tools that are not in quick access, as items of the shared dropdown.
    // The name of each group is a read-only heading row, followed by its tools.
    // When the author picks a tool, it is pinned and placement starts.
    const removeToolTitle = (tool: PaletteTool): string | undefined => {
        const count = isFog(tool)
            ? (def.fog?.hidden.length ?? 0)
            : tool.name === DYNAMIC_TOOL
              ? (def.rules?.length ?? 0)
              : def.constraints.filter((c) =>
                  tool.name === RULE_TOOL ? !isDefinitionRef(c) : isDefinitionRef(c) && c.use === tool.name,
              ).length;
        const what = isFog(tool) ? "hidden cell" : tool.name === DYNAMIC_TOOL ? "rule" : "placed constraint";
        return count > 0
            ? `Remove from quick access. This deletes its ${count} ${what}${count === 1 ? "" : "s"}. Undo restores them.`
            : undefined;
    };

    const addToolItems: MenuItem[] = PALETTE_GROUPS.flatMap((group) => {
        const rest = hidden.filter((tool) => group.names.includes(tool.name));
        return rest.length === 0
            ? []
            : [
                  { label: group.title, info: true, onSelect: () => undefined },
                  ...rest.map((tool) => ({
                      label: tool.label.replace(/ \(global\)$/, ""),
                      onSelect: () => {
                          state.pinTool(tool.name);
                          startTool(tool);
                      },
                  })),
              ];
    });

    return (
        <div className="visual-builder">
            {PALETTE_GROUPS.map((group) => {
                const shown = tools.filter((tool) => group.names.includes(tool.name)).filter(isQuick);
                if (shown.length === 0) return null;
                return (
                    <section key={group.title} className="visual-builder-group" aria-label={group.title}>
                        <h3 className="visual-builder-heading">{group.title}</h3>
                        <div className="visual-builder-palette">
                            {shown.map((tool) => {
                                const schema = AUTHORING_SCHEMAS.find((s) => s.name === tool.name);
                                const placed = !!schema && isGlobalPlaced(def, schema);
                                return (
                                    <div key={tool.name} className="visual-builder-tool">
                                        <button
                                            type="button"
                                            className="btn btn-sm visual-builder-chip"
                                            aria-pressed={
                                                isFog(tool)
                                                    ? fog.active
                                                    : tool.name === RULE_TOOL
                                                      ? rule.active && rule.kind === "constraint"
                                                      : tool.name === DYNAMIC_TOOL
                                                        ? rule.active && rule.kind === "dynamic"
                                                      : activeSchema?.name === tool.name
                                            }
                                            disabled={placed}
                                            title={
                                                placed
                                                    ? "Already added. To change it, remove it from the list below."
                                                    : undefined
                                            }
                                            onClick={() => startTool(tool)}
                                        >
                                            {/* "Whole grid" is already the section heading. A tick shows a placed rule. */}
                                            {placed && "✓ "}
                                            {tool.label.replace(/ \(global\)$/, "")}
                                        </button>
                                        {(pinned.has(tool.name) || used.has(tool.name)) && (
                                            <button
                                                type="button"
                                                className="visual-builder-unpin"
                                                aria-label={`Remove ${tool.label} from quick access`}
                                                title={removeToolTitle(tool)}
                                                onClick={() => removeTool(tool.name)}
                                            >
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                );
            })}

            {addToolItems.length > 0 && (
                <OverflowMenu
                    label="Add tool"
                    text={quickCount === 0 ? "Pick a tool to start…" : "Add tool…"}
                    align="start"
                    items={addToolItems}
                />
            )}

            {fog.active && (
                <div className="visual-builder-form" aria-label="Fog">
                    {fog.hasSolution ? (
                        <p className="author-hint">
                            {fog.reveal
                                ? "Drag on the board to reveal cells."
                                : "Drag on the board to hide cells. Each cell shows when it is solved."}
                            {fog.hidden.length > 0 &&
                                ` ${fog.hidden.length} cell${fog.hidden.length === 1 ? " is" : "s are"} hidden.`}
                        </p>
                    ) : (
                        <>
                            <p className="author-hint">
                                Fog shows cells when they are solved. The puzzle needs a solution first.
                            </p>
                            <div className="visual-builder-actions">
                                <button
                                    type="button"
                                    className="btn btn-sm"
                                    disabled={fog.finding}
                                    onClick={() => void fog.findSolution()}
                                >
                                    {fog.finding ? "Solving…" : "Find solution"}
                                </button>
                            </div>
                        </>
                    )}
                    {fog.hidden.length > 0 && (
                        <label className="visual-builder-param">
                            <input
                                type="checkbox"
                                checked={fog.reveal}
                                onChange={(e) => fog.setReveal(e.target.checked)}
                            />
                            Reveal instead of hide
                        </label>
                    )}
                    <div className="visual-builder-actions">
                        <button
                            type="button"
                            className="btn btn-sm"
                            disabled={fog.hidden.length === 0}
                            onClick={fog.clear}
                        >
                            Clear fog
                        </button>
                        <button type="button" className="btn btn-sm" onClick={cancelPlacing}>
                            Done
                        </button>
                    </div>
                </div>
            )}

            {rule.active && rule.kind === "constraint" && <RuleEditor rule={rule} />}
            {rule.active && rule.kind === "dynamic" && (
                <DynamicRuleEditor
                    rule={rule}
                    constraintNames={def.constraints.flatMap((c) =>
                        isDefinitionRef(c) ? [c.use] : "name" in (c as object) ? [String((c as { name: unknown }).name)] : [],
                    )}
                    onAdd={rule.addDynamic}
                />
            )}

            {activeSchema && (
                <div className="visual-builder-form">
                    {activeSchema.fields.filter((f) => f.kind === "cell" || f.kind === "cells").length > 1 && (
                        <p className="author-hint">Click a field below, then drag on the board to fill it.</p>
                    )}
                    {activeSchema.fields.map((f) => {
                        if (f.kind === "cell" || f.kind === "cells") {
                            const v = fieldValues[f.key];
                            const summary =
                                f.kind === "cell"
                                    ? (v as string | undefined) || "(drag on the board)"
                                    : Array.isArray(v) && v.length > 0
                                      ? v.join(", ")
                                      : "(drag on the board)";
                            return (
                                <button
                                    key={f.key}
                                    type="button"
                                    className={`visual-builder-cell-field ${activeFieldKey === f.key ? "active" : ""}`}
                                    onClick={() => setActiveField(f.key)}
                                >
                                    <span className="visual-builder-cell-field-label">{f.label}:</span>
                                    <span className="visual-builder-cell-field-value">{summary}</span>
                                </button>
                            );
                        }
                        return null;
                    })}

                    {activeSchema.fields
                        .filter(
                            (f): f is Extract<AuthoringField, { kind: "number" | "boolean" | "numberList" }> =>
                                f.kind === "number" || f.kind === "boolean" || f.kind === "numberList",
                        )
                        .map((f) => (
                            <label key={f.key} className="visual-builder-param">
                                {f.kind === "boolean" ? (
                                    <>
                                        <input
                                            type="checkbox"
                                            checked={(fieldValues[f.key] as boolean | undefined) ?? f.default}
                                            onChange={(e) => setField(f.key, e.target.checked)}
                                        />
                                        {f.label}
                                    </>
                                ) : f.kind === "number" ? (
                                    <>
                                        {f.label}
                                        <input
                                            type="number"
                                            value={
                                                fieldValues[f.key] === undefined ? "" : (fieldValues[f.key] as number)
                                            }
                                            onChange={(e) =>
                                                setField(
                                                    f.key,
                                                    e.target.value === "" ? undefined : Number(e.target.value),
                                                )
                                            }
                                        />
                                    </>
                                ) : (
                                    <>
                                        {f.label}
                                        <input
                                            type="text"
                                            placeholder="e.g. 3,3"
                                            onChange={(e) => {
                                                const nums = e.target.value
                                                    .split(",")
                                                    .map((s) => Number(s.trim()))
                                                    .filter((n) => Number.isFinite(n));
                                                setField(f.key, nums.length > 0 ? nums : undefined);
                                            }}
                                        />
                                    </>
                                )}
                            </label>
                        ))}

                    <div className="visual-builder-actions">
                        {/* A drag on the board places the constraint by itself. The Add button
                            exists only for schemas that also need typed input (the sum of xv, and so on). */}
                        {activeSchema.fields.some((f) => f.kind === "number" || f.kind === "numberList") && (
                            <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={addConstraint}
                                disabled={!isSchemaComplete(activeSchema, fieldValues)}
                            >
                                Add {activeSchema.label}
                            </button>
                        )}
                        <button type="button" className="btn btn-sm" onClick={cancelPlacing}>
                            Done
                        </button>
                    </div>
                </div>
            )}

            {def.constraints.length > 0 && (
                <h3 className="visual-builder-heading">In this puzzle ({def.constraints.length})</h3>
            )}
            <ul className="visual-builder-list">
                {def.constraints.map((c, i) => {
                    const styleable = drawsObjects(c, def);
                    return (
                        <li key={i}>
                            <span>{summarizeConstraint(c)}</span>
                            {styleable && (
                                <button
                                    type="button"
                                    aria-label="Style constraint"
                                    aria-expanded={styling === i}
                                    onClick={() => setStyling(styling === i ? null : i)}
                                >
                                    <Palette size={14} />
                                </button>
                            )}
                            <button type="button" aria-label="Remove constraint" onClick={() => removeConstraint(i)}>
                                <X size={14} />
                            </button>
                            {styleable && styling === i && isDefinitionRef(c) && (
                                <StyleEditor spec={c} onChange={(next) => updateConstraint(i, next)} />
                            )}
                        </li>
                    );
                })}
            </ul>
            {(def.rules?.length ?? 0) > 0 && (
                <>
                    <h3 className="visual-builder-heading">Dynamic rules ({def.rules?.length})</h3>
                    <ul className="visual-builder-list">
                        {def.rules?.map((r, i) => (
                            <li key={i}>
                                <span>{summarizeRule(r)}</span>
                                <button type="button" aria-label="Remove dynamic rule" onClick={() => removeRule(i)}>
                                    <X size={14} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}
