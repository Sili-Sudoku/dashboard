import { AUTHORING_SCHEMAS, isSchemaComplete, summarizeConstraint, type AuthoringField } from "@/authoring/schema.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import type { VisualBuilderState } from "@/features/author/use_visual_builder.ts";

interface Props {
    def: PuzzleDefinition | undefined;
    state: VisualBuilderState;
}

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
    } = state;

    if (!def) {
        return <p className="author-notice">Fix the JSON errors above (or switch to the JSON tab) to use the visual builder.</p>;
    }

    return (
        <div className="visual-builder">
            <div className="visual-builder-palette">
                {AUTHORING_SCHEMAS.map((schema) => (
                    <button
                        key={schema.name}
                        type="button"
                        className={`secondary ${activeSchema?.name === schema.name ? "active" : ""}`}
                        onClick={() => startPlacing(schema)}
                    >
                        {schema.label}
                    </button>
                ))}
            </div>

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
                        .filter((f): f is Extract<AuthoringField, { kind: "number" | "boolean" | "numberList" }> =>
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
                                            value={fieldValues[f.key] === undefined ? "" : (fieldValues[f.key] as number)}
                                            onChange={(e) =>
                                                setField(f.key, e.target.value === "" ? undefined : Number(e.target.value))
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
                        <button type="button" className="secondary" onClick={cancelPlacing}>
                            Cancel
                        </button>
                        <button type="button" onClick={addConstraint} disabled={!isSchemaComplete(activeSchema, fieldValues)}>
                            Add {activeSchema.label}
                        </button>
                    </div>
                </div>
            )}

            <ul className="visual-builder-list">
                {def.constraints.map((c, i) => (
                    <li key={i}>
                        <span>{summarizeConstraint(c)}</span>
                        <button type="button" aria-label="Remove constraint" onClick={() => removeConstraint(i)}>
                            ×
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
