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
import { isGlobalPlaced, type VisualBuilderState } from "@/features/author/use_visual_builder.ts";

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
];

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
    const used = new Set(def.constraints.flatMap((c) => (isDefinitionRef(c) ? [c.use] : [])));
    const isQuick = (schema: AuthoringSchema) => pinned.has(schema.name) || used.has(schema.name);
    const hidden = AUTHORING_SCHEMAS.filter((schema) => !isQuick(schema));
    const quickCount = AUTHORING_SCHEMAS.length - hidden.length;
    // The tools not in quick access, as the shared dropdown's items: each group's name is a
    // read-only heading row, then its tools. Picking one pins it and starts placing it.
    const removeToolTitle = (schema: AuthoringSchema): string | undefined => {
        const count = def.constraints.filter((c) => isDefinitionRef(c) && c.use === schema.name).length;
        return count > 0
            ? `Remove from quick access and delete its ${count} placed constraint${count === 1 ? "" : "s"} (undo brings them back)`
            : undefined;
    };

    const addToolItems: MenuItem[] = PALETTE_GROUPS.flatMap((group) => {
        const rest = hidden.filter((schema) => group.names.includes(schema.name));
        return rest.length === 0
            ? []
            : [
                  { label: group.title, info: true, onSelect: () => undefined },
                  ...rest.map((schema) => ({
                      label: schema.label.replace(/ \(global\)$/, ""),
                      onSelect: () => {
                          state.pinTool(schema.name);
                          startPlacing(schema);
                      },
                  })),
              ];
    });

    return (
        <div className="visual-builder">
            {PALETTE_GROUPS.map((group) => {
                const tools = AUTHORING_SCHEMAS.filter((schema) => group.names.includes(schema.name));
                const shown = tools.filter(isQuick);
                if (shown.length === 0) return null;
                return (
                    <section key={group.title} className="visual-builder-group" aria-label={group.title}>
                        <h3 className="visual-builder-heading">{group.title}</h3>
                        <div className="visual-builder-palette">
                            {shown.map((schema) => (
                                <div key={schema.name} className="visual-builder-tool">
                                    <button
                                        type="button"
                                        className="btn btn-sm visual-builder-chip"
                                        aria-pressed={activeSchema?.name === schema.name}
                                        disabled={isGlobalPlaced(def, schema)}
                                        title={
                                            isGlobalPlaced(def, schema)
                                                ? "Already added — remove it from the list below to change it"
                                                : undefined
                                        }
                                        onClick={() => startPlacing(schema)}
                                    >
                                        {/* "Whole grid" is already the section heading, and a placed rule is ticked. */}
                                        {isGlobalPlaced(def, schema) && "✓ "}
                                        {schema.label.replace(/ \(global\)$/, "")}
                                    </button>
                                    {(pinned.has(schema.name) || used.has(schema.name)) && (
                                        <button
                                            type="button"
                                            className="visual-builder-unpin"
                                            aria-label={`Remove ${schema.label} from quick access`}
                                            title={removeToolTitle(schema)}
                                            onClick={() => removeTool(schema.name)}
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            ))}
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
