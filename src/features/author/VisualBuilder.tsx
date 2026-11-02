import { X } from "lucide-react";

import { OverflowMenu, type MenuItem } from "@/app/overflow_menu.tsx";

import {
    AUTHORING_SCHEMAS,
    isSchemaComplete,
    summarizeConstraint,
    type AuthoringField,
    type AuthoringSchema,
} from "@/authoring/schema.ts";
import { isDefinitionRef, type PuzzleDefinition } from "@/runtime/puzzle.ts";
import { FOG_TOOL, isGlobalPlaced, type VisualBuilderState } from "@/features/author/use_visual_builder.ts";

interface Props {
    def: PuzzleDefinition | undefined;
    state: VisualBuilderState;
}

/** The palette's sections, by what the author is placing: a path, a mark on cells, or a rule for the whole grid. */
const PALETTE_GROUPS: { title: string; names: string[] }[] = [
    {
        title: "Lines & regions",
        names: ["thermometer", "arrow", "killer", "palindrome", "betweenline", "clone", "sandwich", "quadruple"],
    },
    { title: "Cell marks", names: ["kropkiDifference", "kropkiRatio", "odd", "even", "minimum", "maximum", "xv"] },
    { title: "Whole grid", names: ["sudoku", "antiknight", "antiking", "nonconsecutive", "disjointgroups"] },
    { title: "Hidden cells", names: [FOG_TOOL] },
];

/** Every tool the palette offers: each definition that declares a builder schema, plus fog (which edits the puzzle itself). */
interface PaletteTool {
    name: string;
    label: string;
}
const FOG_ENTRY: PaletteTool = { name: FOG_TOOL, label: "Fog" };

/** Visual/drag-and-drop puzzle authoring (#54): a palette of definitions, a
 *  small param form per definition, and a list of already-placed constraints.
 *  Deliberately doesn't render its own board — pick a definition, then
 *  click/drag directly on the Author page's one PuzzlePlayer board (its
 *  normal click/drag/shift-click selection) to place it; the highlighted
 *  field below mirrors that selection live (see use_visual_builder.ts).
 *  There's exactly one board on screen, not a second one just for this.
 *  Scoped to the definitions that have an AUTHORING_SCHEMAS entry — anything
 *  else is still reachable via the JSON tab, same "cover common types, never
 *  silently drop the rest" spirit as the f-puzzles importer (#66). */
export default function VisualBuilder({ def, state }: Props) {
    const {
        fog,
        activeSchema,
        activeFieldKey,
        fieldValues,
        startPlacing,
        cancelPlacing,
        setField,
        setActiveField,
        addConstraint,
        removeConstraint,
        removeTool,
    } = state;

    if (!def) {
        return (
            <p className="author-notice">
                Fix the JSON errors above (or switch to the JSON tab) to use the visual builder.
            </p>
        );
    }

    // Quick access = what the author pinned, plus anything the puzzle's JSON already uses; every other
    // tool sits behind the "Add tool" dropdown.
    const pinned = new Set(state.tools);
    const used = new Set([...def.constraints.flatMap((c) => (isDefinitionRef(c) ? [c.use] : [])), ...(def.fog ? [FOG_TOOL] : [])]);
    const tools: PaletteTool[] = [...AUTHORING_SCHEMAS, FOG_ENTRY];
    const isQuick = (tool: PaletteTool) => pinned.has(tool.name) || used.has(tool.name);
    const hidden = tools.filter((tool) => !isQuick(tool));
    const quickCount = tools.length - hidden.length;
    const isFog = (tool: PaletteTool) => tool.name === FOG_TOOL;
    const startTool = (tool: PaletteTool) => {
        if (isFog(tool)) fog.start();
        else startPlacing(AUTHORING_SCHEMAS.find((s) => s.name === tool.name) as AuthoringSchema);
    };
    // The tools not in quick access, as the shared dropdown's items: each group's name is a
    // read-only heading row, then its tools. Picking one pins it and starts placing it.
    const removeToolTitle = (tool: PaletteTool): string | undefined => {
        const count = isFog(tool)
            ? (def.fog?.hidden.length ?? 0)
            : def.constraints.filter((c) => isDefinitionRef(c) && c.use === tool.name).length;
        const what = isFog(tool) ? "hidden cell" : "placed constraint";
        return count > 0
            ? `Remove from quick access and delete its ${count} ${what}${count === 1 ? "" : "s"} (undo brings them back)`
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
                                            aria-pressed={isFog(tool) ? fog.active : activeSchema?.name === tool.name}
                                            disabled={placed}
                                            title={
                                                placed
                                                    ? "Already added — remove it from the list below to change it"
                                                    : undefined
                                            }
                                            onClick={() => startTool(tool)}
                                        >
                                            {/* "Whole grid" is already the section heading, and a placed rule is ticked. */}
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
                            {fog.reveal ? "Drag on the board to reveal cells." : "Drag on the board to hide cells until they're solved."}
                            {fog.hidden.length > 0 &&
                                ` ${fog.hidden.length} cell${fog.hidden.length === 1 ? " is" : "s are"} hidden.`}
                        </p>
                    ) : (
                        <>
                            <p className="author-hint">
                                Fog reveals cells as they're solved, so the puzzle needs a solution first.
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
                        {/* Dragging on the board places the constraint by itself; the Add button
                            only exists for schemas that also need typed input (xv's sum, etc.). */}
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
                {def.constraints.map((c, i) => (
                    <li key={i}>
                        <span>{summarizeConstraint(c)}</span>
                        <button type="button" aria-label="Remove constraint" onClick={() => removeConstraint(i)}>
                            <X size={14} />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
