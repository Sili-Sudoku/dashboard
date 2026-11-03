import { useState } from "react";

import { toast } from "@/app/toast.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { solve } from "@/runtime/solver.ts";

import { createGeometry, type CellId } from "@/runtime/geometry.ts";
import {
    isDefinitionRef,
    type ConstraintSpec,
    type PuzzleDefinition,
    type PuzzleRule,
    type VisualObject,
} from "@/runtime/puzzle.ts";
import { definitions } from "@/definitions/index.ts";
import {
    buildConstraintParams,
    cellFieldsOf,
    isSchemaComplete,
    type AuthoringField,
    type AuthoringSchema,
    type FieldValue,
} from "@/authoring/schema.ts";
import { getAt, isComplete, setAt, toExpr, type Path, type RuleNode } from "@/authoring/rule_tree.ts";

/** The undo history of the page holds the list of pinned tools. The hook only reports changes to it. */
export interface Toolbox {
    tools: readonly string[];
    /** Set the pinned tools. Optionally change the puzzle in the same call. This is one undoable step. */
    onChange: (tools: readonly string[], def?: PuzzleDefinition) => void;
}

/** Fog is a tool like the others. It edits a field of the puzzle and does not add a constraint. */
export const FOG_TOOL = "fog";

/** The custom-rule editor is also a tool. It builds one constraint from primitive operators. */
export const RULE_TOOL = "rule";

/** Dynamic rules: "when this holds, then …". The condition uses the custom-rule editor. */
export const DYNAMIC_TOOL = "dynamic";

const withoutRules = (def: PuzzleDefinition): PuzzleDefinition => {
    const copy = { ...def };
    delete copy.rules;
    return copy;
};

/** The puzzle with no `fog` field at all. An empty `fog` field is not the same as no `fog` field. */
const withoutFog = (def: PuzzleDefinition): PuzzleDefinition => {
    const copy = { ...def };
    delete copy.fog;
    return copy;
};

export interface FogControls {
    /** The fog tool is in use. A drag on the board hides (or reveals) the cells it covers. */
    active: boolean;
    start: () => void;
    hidden: readonly CellId[];
    /** A drag reveals cells and does not hide them. */
    reveal: boolean;
    setReveal: (reveal: boolean) => void;
    /** Fog reveals cells when the player solves them. A puzzle can declare fog only if it has a `solution`. */
    hasSolution: boolean;
    /** Runs the solver and stores the solution in the puzzle. This is one undoable step. */
    findSolution: () => Promise<void>;
    finding: boolean;
    clear: () => void;
}

export interface RuleControls {
    active: boolean;
    /** The tree becomes a constraint or the condition of a dynamic rule. */
    kind: "constraint" | "dynamic";
    start: (kind?: "constraint" | "dynamic") => void;
    /** The rule so far. The live selection of the board is already in the slot that the author fills. */
    tree: RuleNode | null;
    /** The slot that receives the selection of the board. */
    path: Path;
    setPath: (path: Path) => void;
    /** Put a node (or nothing) in the slot at `path`. A cells/cell leaf also becomes the slot that the board fills. */
    set: (path: Path, node: RuleNode | null) => void;
    /** Replace the whole tree (to add or remove the slots of a variadic operator). */
    replace: (tree: RuleNode | null) => void;
    complete: boolean;
    /** The cells that are selected on the board now, for effects that name cells. */
    selected: readonly CellId[];
    /** The name of the rule in the list of the puzzle. If it is blank, the list shows the expression. */
    name: string;
    setName: (name: string) => void;
    add: () => void;
    /** Add the tree as the `when` of a dynamic rule with these effects. The name becomes the id of the rule. */
    addDynamic: (then: PuzzleRule["then"]) => void;
}

export interface VisualBuilderState {
    fog: FogControls;
    rule: RuleControls;
    /** Names of the tools that are pinned to quick access. */
    tools: readonly string[];
    pinTool: (name: string) => void;
    /** Un-pin a tool and delete all its constraints from the puzzle. This is one undoable step. */
    removeTool: (name: string) => void;
    activeSchema: AuthoringSchema | undefined;
    activeCellFields: readonly AuthoringField[];
    /** The cell/cells field that receives the selection of the board now. See the comment of the hook.
     *  It is undefined when a schema has no cell fields. */
    activeFieldKey: string | undefined;
    fieldValues: Readonly<Record<string, FieldValue>>;
    /** The graphics of the constraint in progress (for example the line of a thermometer).
     *  They come from a call to its definition with the cells that are selected so far.
     *  See the comment of the hook. Draw them on top of the board like real, committed objects.
     *  The list is empty when too few cells are selected for the definition to produce anything. */
    previewObjects: readonly VisualObject[];
    startPlacing: (schema: AuthoringSchema) => void;
    cancelPlacing: () => void;
    setField: (key: string, value: FieldValue) => void;
    setActiveField: (key: string) => void;
    /** Call this when a drag or click on the board ends (`onSelectionEnd` of PuzzlePlayer).
     *  It commits the constraint if the selection supplied the last missing value.
     *  Thus a drag onto the grid places a definition with no separate "Add" click.
     *  It does nothing if the schema needs a value that a drag cannot supply
     *  (for example the required target number of xv). The Add button finishes those. */
    onBoardSelectionEnd: () => void;
    addConstraint: () => void;
    removeConstraint: (index: number) => void;
    removeRule: (index: number) => void;
    /** Replace a placed constraint in place (its colour or style, #165). This is one undoable step. */
    updateConstraint: (index: number, spec: ConstraintSpec) => void;
}

const applySelectionToField = (field: AuthoringField, selection: ReadonlySet<CellId>): FieldValue => {
    if (field.kind === "cell") {
        const [first] = selection;
        return first;
    }
    const cells = [...selection];
    return field.kind === "cells" && field.max !== undefined ? cells.slice(0, field.max) : cells;
};

/** All the state and logic of the visual builder.
 *  The author picks a definition from the palette. Then the author clicks or drags on the board
 *  to place it. The board is the one ordinary PuzzlePlayer of the Author page (see `onSelectionChange`
 *  of PuzzlePlayer). The gesture is the same as the selection of cells for digit entry.
 *  The "active" cell field mirrors the live selection of the board.
 *  The hook derives it from the selection on every render and does not copy it into state.
 *  Thus a drag has an immediate effect.
 *  `setActiveField` switches to a different field. Schemas with more than one cell field need it,
 *  for example the bulb and shaft of arrow, or the cells and cloneCells of clone.
 *  It first freezes the current value of the old field, so the value stays after the switch.
 *  `onBoardSelectionEnd` commits the constraint when the drag supplied the last missing value.
 *  This gives no separate "Add" click for a definition that needs only cells
 *  (and maybe optional params that have defaults).
 *  A definition with no fields (for example antiknight) commits when the author picks it.
 *  Picking it is the same as placing it. Nothing is left to draw on the board. */
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
    // A tool counts as placed only while it is in the toolbox (or the puzzle uses it).
    // Thus an undo past the pinning of a tool drops it. No form stays for a tool that is gone.
    const activeSchema =
        placingSchema &&
        (toolbox.tools.includes(placingSchema.name) ||
            def?.constraints.some((c) => isDefinitionRef(c) && c.use === placingSchema.name))
            ? placingSchema
            : undefined;
    const [activeFieldKey, setActiveFieldKeyState] = useState<string | undefined>();
    // Cell/cells values only: the selection of the board, frozen when the author switches field.
    // Every commit or cancel clears them. The cells of a placed constraint never carry over to the next one.
    const [cellValues, setCellValues] = useState<Record<string, FieldValue>>({});
    // Typed params (a sum, a "strict" checkbox, ...) for each schema name. The hook keeps them across
    // placements, cancels, and a switch to another schema and back until the author changes them.
    const [paramMemory, setParamMemory] = useState<Readonly<Record<string, Readonly<Record<string, FieldValue>>>>>({});

    const activeCellFields = activeSchema ? cellFieldsOf(activeSchema) : [];
    const activeField = activeCellFields.find((f) => f.key === activeFieldKey);

    const baseValues: Record<string, FieldValue> = {
        ...cellValues,
        ...(activeSchema && paramMemory[activeSchema.name]),
    };
    const effectiveValues: Record<string, FieldValue> = activeField
        ? { ...baseValues, [activeField.key]: applySelectionToField(activeField, selection) }
        : baseValues;

    // The hook derives this from the live selection on every render, like effectiveValues above.
    // It is not in state. Thus the shape grows or shrinks with each cell that the drag touches.
    // It does not wait until the selection is complete enough to commit.
    // A partial selection can be too small for the definition (for example a thermometer needs 2+ cells).
    // Then the result is no preview and not an error. The renderer draws nothing for it.
    const toolPreview: readonly VisualObject[] = (() => {
        if (!def || !activeSchema) return [];
        const definition = definitions[activeSchema.name];
        if (!definition) return [];
        const params = buildConstraintParams(activeSchema, effectiveValues);
        const geometry = createGeometry(def.geometry);
        const output = definition(params, { geometry, regions: def.regions ?? {}, domain: def.domain.values });
        if (output instanceof Error) return [];
        return output.objects ?? [];
    })();

    // The board tints the fogged cells during authoring. Thus the author sees where the fog is
    // before the puzzle has a solution. (The real fog needs a solution to show at all.)
    const previewObjects: readonly VisualObject[] = def?.fog?.hidden.length
        ? [
              ...toolPreview,
              {
                  kind: "region",
                  cells: def.fog.hidden,
                  style: { fill: "var(--fog-line)", stroke: "none", opacity: 0.4, z: 5 },
              },
          ]
        : toolPreview;

    // Fog: when the author picks the tool, a drag on the board hides cells (or reveals them).
    // It does not fill the fields of a constraint. Like all tools, it counts only while
    // it is in the toolbox or the puzzle has fog.
    const [fogPlacing, setFogPlacing] = useState(false);
    const [reveal, setReveal] = useState(false);
    const fogActive = fogPlacing && (toolbox.tools.includes(FOG_TOOL) || !!def?.fog);
    const setFog = (hidden: readonly CellId[]) => {
        if (!def) return;
        onChange(hidden.length > 0 ? { ...def, fog: { hidden } } : withoutFog(def));
    };
    const [finding, setFinding] = useState(false);
    const findSolution = async () => {
        if (!def || finding) return;
        const compiled = compilePuzzle(def, definitions, { validateSolution: false });
        if (compiled instanceof Error) {
            toast(compiled.message, { kind: "error", key: "fog-solution" });
            return;
        }
        setFinding(true);
        const found = await solve(compiled);
        setFinding(false);
        if (!found.solution) {
            toast(
                found.status === "none" ? "No solution. The givens conflict." : "The search for a solution timed out.",
                { kind: "error", key: "fog-solution" },
            );
            return;
        }
        onChange({ ...def, solution: found.solution });
        if (found.status === "multiple") {
            toast("The puzzle has several solutions. The app uses the first solution that it finds.", {
                kind: "info",
                key: "fog-solution",
            });
        }
    };
    const fogHidden = def?.fog?.hidden ?? [];
    const fog: FogControls = {
        active: fogActive,
        start: () => {
            setActiveSchema(undefined);
            setActiveFieldKeyState(undefined);
            setCellValues({});
            setRulePlacing(false);
            setFogPlacing(true);
        },
        hidden: fogHidden,
        reveal,
        setReveal,
        hasSolution: !!def?.solution && Object.keys(def.solution).length > 0,
        findSolution,
        finding,
        clear: () => setFog([]),
    };

    // Custom rule: the tree in progress and the slot that receives the selection of the board.
    const [rulePlacing, setRulePlacing] = useState(false);
    const [ruleTree, setRuleTree] = useState<RuleNode | null>(null);
    const [rulePath, setRulePathState] = useState<Path>([]);
    const [ruleName, setRuleName] = useState("");
    const [ruleKind, setRuleKind] = useState<"constraint" | "dynamic">("constraint");
    const ruleActive = rulePlacing && toolbox.tools.includes(ruleKind === "dynamic" ? DYNAMIC_TOOL : RULE_TOOL);
    const withSelection = (tree: RuleNode | null, path: Path): RuleNode | null => {
        const node = getAt(tree, path);
        if (node?.k === "cells" && node.selector.trim() === "")
            return setAt(tree, path, { ...node, cells: [...selection] });
        if (node?.k === "cell") return setAt(tree, path, { ...node, cell: [...selection][0] });
        return tree;
    };
    const liveRule = ruleActive ? withSelection(ruleTree, rulePath) : ruleTree;
    const rule: RuleControls = {
        active: ruleActive,
        kind: ruleKind,
        start: (kind = "constraint") => {
            setRuleKind(kind);
            setActiveSchema(undefined);
            setActiveFieldKeyState(undefined);
            setCellValues({});
            setFogPlacing(false);
            setRulePlacing(true);
        },
        tree: liveRule,
        path: rulePath,
        setPath: (path) => {
            setRuleTree(liveRule);
            setRulePathState(path);
        },
        set: (path, node) => {
            setRuleTree(setAt(liveRule, path, node));
            setRulePathState(path);
        },
        replace: setRuleTree,
        complete: isComplete(liveRule),
        selected: [...selection],
        name: ruleName,
        setName: setRuleName,
        add: () => {
            if (!def || !liveRule || !isComplete(liveRule)) return;
            const name = ruleName.trim();
            const spec = name ? { rule: toExpr(liveRule), name } : toExpr(liveRule);
            onChange({ ...def, constraints: [...def.constraints, spec] });
            setRuleName("");
            setRuleTree(null);
            setRulePathState([]);
        },
        addDynamic: (then) => {
            if (!def || !liveRule || !isComplete(liveRule)) return;
            const id = ruleName.trim();
            const next: PuzzleRule = { ...(id ? { id } : {}), when: toExpr(liveRule), then };
            onChange({ ...def, rules: [...(def.rules ?? []), next] });
            setRuleName("");
            setRuleTree(null);
            setRulePathState([]);
        },
    };

    const commit = (schema: AuthoringSchema, values: Readonly<Record<string, FieldValue>>) => {
        if (!def) return;
        const params = buildConstraintParams(schema, values);
        onChange({ ...def, constraints: [...def.constraints, { use: schema.name, ...params }] });
        setCellValues({});
        setActiveFieldKeyState(cellFieldsOf(schema)[0]?.key);
    };

    const startPlacing = (schema: AuthoringSchema) => {
        setFogPlacing(false);
        setRulePlacing(false);
        setCellValues({});
        if (schema.fields.length === 0) {
            setActiveSchema(undefined);
            // A global rule is on or off. A second identical copy only multiplies its violations.
            if (!isGlobalPlaced(def, schema)) commit(schema, {});
            return;
        }
        setActiveSchema(schema);
        setActiveFieldKeyState(cellFieldsOf(schema)[0]?.key);
    };

    const cancelPlacing = () => {
        setFogPlacing(false);
        setRulePlacing(false);
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
        if (ruleActive) {
            setRuleTree(liveRule);
            return;
        }
        if (fogActive) {
            if (selection.size === 0 || !fog.hasSolution) return;
            setFog(reveal ? fogHidden.filter((c) => !selection.has(c)) : [...new Set([...fogHidden, ...selection])]);
            return;
        }
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

    // A tool that the puzzle used stays in the toolbox after the author removes its constraint.
    const removeConstraint = (index: number) => {
        if (!def) return;
        const removed = def.constraints[index];
        const next = { ...def, constraints: def.constraints.filter((_, i) => i !== index) };
        if (removed && isDefinitionRef(removed) && !toolbox.tools.includes(removed.use)) {
            toolbox.onChange([...toolbox.tools, removed.use], next);
        } else onChange(next);
    };

    const removeRule = (index: number) => {
        if (!def) return;
        const rules = (def.rules ?? []).filter((_, i) => i !== index);
        onChange(rules.length > 0 ? { ...def, rules } : withoutRules(def));
    };

    const updateConstraint = (index: number, spec: ConstraintSpec) => {
        if (!def) return;
        onChange({ ...def, constraints: def.constraints.map((c, i) => (i === index ? spec : c)) });
    };

    const removeTool = (name: string) => {
        if (
            activeSchema?.name === name ||
            (name === FOG_TOOL && fogPlacing) ||
            ((name === RULE_TOOL || name === DYNAMIC_TOOL) && rulePlacing)
        ) {
            cancelPlacing();
        }
        if (name === RULE_TOOL || name === DYNAMIC_TOOL) {
            setRuleName("");
            setRuleTree(null);
            setRulePathState([]);
        }
        const stripped = def && {
            ...def,
            constraints: def.constraints.filter((c) =>
                name === RULE_TOOL ? isDefinitionRef(c) : !(isDefinitionRef(c) && c.use === name),
            ),
        };
        // Fog and dynamic rules are not constraints.
        // When the author removes their tool, the field of the puzzle goes too.
        const next =
            stripped && name === FOG_TOOL
                ? withoutFog(stripped)
                : stripped && name === DYNAMIC_TOOL
                  ? withoutRules(stripped)
                  : stripped;
        toolbox.onChange(
            toolbox.tools.filter((t) => t !== name),
            next,
        );
    };

    return {
        fog,
        rule,
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
        removeRule,
        updateConstraint,
    };
};
