import { useState } from "react";

import { createGeometry, type CellId } from "@/runtime/geometry.ts";
import { isDefinitionRef, type PuzzleDefinition, type VisualObject } from "@/runtime/puzzle.ts";
import { definitions } from "@/definitions/index.ts";
import {
    buildConstraintParams,
    cellFieldsOf,
    isSchemaComplete,
    type AuthoringField,
    type AuthoringSchema,
    type FieldValue,
} from "@/authoring/schema.ts";

/** The pinned-tools list lives with the page's undo history, so the hook only reports changes to it. */
export interface Toolbox {
    tools: readonly string[];
    /** Set the pinned tools, optionally along with a puzzle change, as a single undoable step. */
    onChange: (tools: readonly string[], def?: PuzzleDefinition) => void;
}

export interface VisualBuilderState {
    /** Names of the tools pinned to quick access. */
    tools: readonly string[];
    pinTool: (name: string) => void;
    /** Un-pin a tool and delete every constraint of it from the puzzle (one undoable step). */
    removeTool: (name: string) => void;
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
    return field.kind === "cells" && field.max !== undefined ? cells.slice(0, field.max) : cells;
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
/** True when `schema` takes no parameters and the puzzle already has it. */
export const isGlobalPlaced = (def: PuzzleDefinition | undefined, schema: AuthoringSchema): boolean =>
    schema.fields.length === 0 && !!def?.constraints.some((c) => isDefinitionRef(c) && c.use === schema.name);

export const useVisualBuilder = (
    def: PuzzleDefinition | undefined,
    selection: ReadonlySet<CellId>,
    onChange: (next: PuzzleDefinition) => void,
    toolbox: Toolbox,
): VisualBuilderState => {
    const [placingSchema, setActiveSchema] = useState<AuthoringSchema | undefined>();
    // A tool only counts as being placed while it's in the toolbox (or the puzzle uses it), so
    // undoing past its pinning drops it instead of leaving a form for a tool that's gone.
    const activeSchema =
        placingSchema &&
        (toolbox.tools.includes(placingSchema.name) ||
            def?.constraints.some((c) => isDefinitionRef(c) && c.use === placingSchema.name))
            ? placingSchema
            : undefined;
    const [activeFieldKey, setActiveFieldKeyState] = useState<string | undefined>();
    // Cell/cells values only: the board selection frozen when the author switches field. Cleared on
    // every commit/cancel, since a placed constraint's cells never carry over to the next one.
    const [cellValues, setCellValues] = useState<Record<string, FieldValue>>({});
    // Typed params (a sum, a "strict" checkbox, ...) per schema name, remembered across placements,
    // cancelling, and switching to another schema and back (#117) until the author changes them.
    const [paramMemory, setParamMemory] = useState<Readonly<Record<string, Readonly<Record<string, FieldValue>>>>>({});

    const activeCellFields = activeSchema ? cellFieldsOf(activeSchema) : [];
    const activeField = activeCellFields.find((f) => f.key === activeFieldKey);

    const baseValues: Record<string, FieldValue> = { ...cellValues, ...(activeSchema && paramMemory[activeSchema.name]) };
    const effectiveValues: Record<string, FieldValue> = activeField
        ? { ...baseValues, [activeField.key]: applySelectionToField(activeField, selection) }
        : baseValues;

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
        setCellValues({});
        setActiveFieldKeyState(cellFieldsOf(schema)[0]?.key);
    };

    const startPlacing = (schema: AuthoringSchema) => {
        setCellValues({});
        if (schema.fields.length === 0) {
            setActiveSchema(undefined);
            // A global rule is either on or off — a second identical copy only
            // multiplies its violations (#121).
            if (!isGlobalPlaced(def, schema)) commit(schema, {});
            return;
        }
        setActiveSchema(schema);
        setActiveFieldKeyState(cellFieldsOf(schema)[0]?.key);
    };

    const cancelPlacing = () => {
        setActiveSchema(undefined);
        setActiveFieldKeyState(undefined);
        setCellValues({});
    };

    const setCellField = (key: string, value: FieldValue) => setCellValues((v) => ({ ...v, [key]: value }));

    const setField = (key: string, value: FieldValue) => {
        if (!activeSchema) return;
        if (activeCellFields.some((f) => f.key === key)) setCellField(key, value);
        else setParamMemory((m) => ({ ...m, [activeSchema.name]: { ...m[activeSchema.name], [key]: value } }));
    };

    const setActiveField = (key: string) => {
        if (activeField) setCellField(activeField.key, applySelectionToField(activeField, selection));
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

    const pinTool = (name: string) => {
        if (!toolbox.tools.includes(name)) toolbox.onChange([...toolbox.tools, name]);
    };

    // A tool the puzzle used stays in the toolbox once its constraint is removed (#159).
    const removeConstraint = (index: number) => {
        if (!def) return;
        const removed = def.constraints[index];
        const next = { ...def, constraints: def.constraints.filter((_, i) => i !== index) };
        if (removed && isDefinitionRef(removed) && !toolbox.tools.includes(removed.use)) {
            toolbox.onChange([...toolbox.tools, removed.use], next);
        } else onChange(next);
    };

    const removeTool = (name: string) => {
        if (activeSchema?.name === name) cancelPlacing();
        const next = def && {
            ...def,
            constraints: def.constraints.filter((c) => !(isDefinitionRef(c) && c.use === name)),
        };
        toolbox.onChange(
            toolbox.tools.filter((t) => t !== name),
            next,
        );
    };

    return {
        tools: toolbox.tools,
        pinTool,
        removeTool,
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
