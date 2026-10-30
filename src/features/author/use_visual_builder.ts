import { useState } from "react";

import { createGeometry, type CellId } from "@/runtime/geometry.ts";
import type { PuzzleDefinition, VisualObject } from "@/runtime/puzzle.ts";
import { definitions } from "@/definitions/index.ts";
import {
    buildConstraintParams,
    cellFieldsOf,
    isSchemaComplete,
    type AuthoringField,
    type AuthoringSchema,
    type FieldValue,
} from "@/authoring/schema.ts";

export interface VisualBuilderState {
    activeSchema: AuthoringSchema | undefined;
    activeCellFields: readonly AuthoringField[];
    /** Which cell/cells field the board's selection is currently flowing into — see
     *  the hook's own comment. Undefined once a schema has no cell fields at all. */
    activeFieldKey: string | undefined;
    fieldValues: Readonly<Record<string, FieldValue>>;
    /** The in-progress constraint's own graphics (e.g. a thermometer's line),
     *  straight from calling its definition with whatever cells are selected
     *  so far — see the hook's own comment. Draw these on top of the board as
     *  if they were real, committed objects; empty once there isn't enough
     *  selected yet for the definition to produce anything. */
    previewObjects: readonly VisualObject[];
    startPlacing: (schema: AuthoringSchema) => void;
    cancelPlacing: () => void;
    setField: (key: string, value: FieldValue) => void;
    setActiveField: (key: string) => void;
    /** Call when a drag/click on the board finishes (PuzzlePlayer's onSelectionEnd)
     *  — commits the constraint if that finished the last thing it needed, so
     *  dragging a definition onto the grid places it with no separate "Add" click.
     *  A no-op if the schema still needs something a drag can't supply (e.g. xv's
     *  required target number) — those still finish via the Add button. */
    onBoardSelectionEnd: () => void;
    addConstraint: () => void;
    removeConstraint: (index: number) => void;
}

const applySelectionToField = (field: AuthoringField, selection: ReadonlySet<CellId>): FieldValue => {
    if (field.kind === "cell") {
        const [first] = selection;
        return first;
    }
    const cells = [...selection];
    return field.max !== undefined ? cells.slice(0, field.max) : cells;
};

/** All the state/logic behind the visual builder (#54): pick a definition from
 *  the palette, then click/drag directly on the board (the Author page's
 *  single, ordinary PuzzlePlayer one — see PuzzlePlayer's onSelectionChange)
 *  to place it, same gesture as selecting cells for digit entry. Whichever
 *  cell field is "active" just mirrors the board's live selection — derived
 *  straight from it every render, not synced into state — so dragging is
 *  immediate. Switching to a different field (setActiveField; needed for
 *  multi-cell-field schemas like arrow's bulb vs shaft, or clone's cells vs
 *  cloneCells) freezes the outgoing field's then-current value first, so it
 *  survives the switch. Finishing a drag (onBoardSelectionEnd) commits the
 *  constraint outright once that was the last thing it needed — no separate
 *  "Add" click for the common case of a definition that's just cell(s) (plus
 *  maybe optional params with defaults). A definition with no fields at all
 *  (e.g. antiknight) commits the moment it's picked from the palette, same
 *  idea: picking it *is* placing it, nothing left to draw on the board. */
export const useVisualBuilder = (
    def: PuzzleDefinition | undefined,
    selection: ReadonlySet<CellId>,
    onChange: (next: PuzzleDefinition) => void,
): VisualBuilderState => {
    const [activeSchema, setActiveSchema] = useState<AuthoringSchema | undefined>();
    const [activeFieldKey, setActiveFieldKeyState] = useState<string | undefined>();
    const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>({});

    const activeCellFields = activeSchema ? cellFieldsOf(activeSchema) : [];
    const activeField = activeCellFields.find((f) => f.key === activeFieldKey);

    const effectiveValues: Record<string, FieldValue> = activeField
        ? { ...fieldValues, [activeField.key]: applySelectionToField(activeField, selection) }
        : fieldValues;

    // Derived straight from the live selection every render, same as effectiveValues
    // above — not stored in state, so the shape grows/shrinks on every cell the drag
    // touches, not just once it's complete enough to commit. Whatever the definition
    // can't yet produce from a partial selection (e.g. thermometer needs 2+ cells)
    // just yields no preview rather than an error, which the renderer already treats
    // as "draw nothing for this one".
    const previewObjects: readonly VisualObject[] = (() => {
        if (!def || !activeSchema) return [];
        const definition = definitions[activeSchema.name];
        if (!definition) return [];
        const params = buildConstraintParams(activeSchema, effectiveValues);
        const geometry = createGeometry(def.geometry);
        const output = definition(params, { geometry, regions: def.regions ?? {}, domain: def.domain.values });
        if (output instanceof Error) return [];
        return output.objects ?? [];
    })();

    const commit = (schema: AuthoringSchema, values: Readonly<Record<string, FieldValue>>) => {
        if (!def) return;
        const params = buildConstraintParams(schema, values);
        onChange({ ...def, constraints: [...def.constraints, { use: schema.name, ...params }] });
        setFieldValues({});
        setActiveFieldKeyState(cellFieldsOf(schema)[0]?.key);
    };

    const startPlacing = (schema: AuthoringSchema) => {
        setFieldValues({});
        if (schema.fields.length === 0) {
            setActiveSchema(undefined);
            commit(schema, {});
            return;
        }
        setActiveSchema(schema);
        setActiveFieldKeyState(cellFieldsOf(schema)[0]?.key);
    };

    const cancelPlacing = () => {
        setActiveSchema(undefined);
        setActiveFieldKeyState(undefined);
        setFieldValues({});
    };

    const setField = (key: string, value: FieldValue) => setFieldValues((v) => ({ ...v, [key]: value }));

    const setActiveField = (key: string) => {
        if (activeField) setField(activeField.key, applySelectionToField(activeField, selection));
        setActiveFieldKeyState(key);
    };

    const onBoardSelectionEnd = () => {
        if (!activeSchema || !activeFieldKey) return;
        if (!isSchemaComplete(activeSchema, effectiveValues)) return;
        commit(activeSchema, effectiveValues);
    };

    const addConstraint = () => {
        if (!activeSchema || !isSchemaComplete(activeSchema, effectiveValues)) return;
        commit(activeSchema, effectiveValues);
    };

    const removeConstraint = (index: number) => {
        if (!def) return;
        onChange({ ...def, constraints: def.constraints.filter((_, i) => i !== index) });
    };

    return {
        activeSchema,
        activeCellFields,
        activeFieldKey,
        fieldValues: effectiveValues,
        previewObjects,
        startPlacing,
        cancelPlacing,
        setField,
        setActiveField,
        onBoardSelectionEnd,
        addConstraint,
        removeConstraint,
    };
};
