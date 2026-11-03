import { Eye, EyeOff, Redo2, TriangleAlert, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { toast } from "@/app/toast.ts";
import { useSettings, type EditorMode } from "@/app/use_settings.ts";
import { compilePuzzle, solutionViolations } from "@/runtime/compile.ts";
import { GridGeometry, describeGeometry } from "@/runtime/geometry.ts";
import { puzzleToCode } from "@/authoring/to_code.ts";
import { parsePuzzle, encodePuzzle } from "@/runtime/serialization.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import { solve, type SolveResult } from "@/runtime/solver.ts";
import { definitions } from "@/definitions/index.ts";
import { demoMixed, listPuzzles } from "@/puzzles/index.ts";
import PuzzlePlayer from "@/player/PuzzlePlayer.tsx";
import VisualBuilder from "@/features/author/VisualBuilder.tsx";
import DimInput from "@/features/author/dim_input.tsx";
import ImportDialog from "@/features/author/import_dialog.tsx";
import { useAuthorInterop } from "@/features/author/use_author_interop.ts";
import { useVisualBuilder } from "@/features/author/use_visual_builder.ts";
import type { CellId } from "@/runtime/geometry.ts";
import { PuzzleBuilder } from "@/authoring/builder.ts";
import { OverflowMenu, type MenuItem } from "@/app/overflow_menu.tsx";
import { usePageHeader } from "@/app/page_header.ts";
import sudokuMakerIcon from "./sudokumaker-icon.png";
import sudokuPadIcon from "./sudokupad-icon.png";

import "./style.css";

const FPuzzlesIcon = () => (
    <span className="author-icon author-icon-f" aria-hidden="true">
        F
    </span>
);

const SudokuMakerIcon = () => <img className="author-icon" src={sudokuMakerIcon} alt="" width={16} height={16} />;

const SudokuPadIcon = () => <img className="author-icon" src={sudokuPadIcon} alt="" width={16} height={16} />;

/** Changes "antiking#56, antiking#73, thermometer#2" to "antiking ×2, thermometer#2".
 *  A global rule can have hundreds of violating cell pairs.
 *  A list of every id made the notice a wall of text. */
const summarizeConflicts = (ids: ReadonlySet<string>): string => {
    const byKind = new Map<string, string[]>();
    for (const id of ids) {
        const kind = id.split("#")[0];
        byKind.set(kind, [...(byKind.get(kind) ?? []), id]);
    }
    return [...byKind].map(([kind, list]) => (list.length > 1 ? `${kind} ×${list.length}` : list[0])).join(", ");
};

/** Maximum number of snapshots for author undo. Each snapshot is a full JSON text, so the number has a limit. */
const HISTORY_LIMIT = 100;

const BUILDER_EXAMPLE = `// PuzzleBuilder is available. Return the built puzzle. Run loads it into the editor.
return PuzzleBuilder.create("thermo-demo", "Thermo Demo")
  .grid(9, 9)
  .domain([1, 2, 3, 4, 5, 6, 7, 8, 9])
  // add constraints (definitions compile to primitives)
  .use("sudoku")
  .use("thermometer", { cells: ["r1c1", "r1c2", "r1c3"] })
  // or add a raw primitive (no definition)
  .constraint(["==", ["sum", ["cells", "col:0"]], 45])
  // add a visual object that the renderer draws
  .visual({ kind: "text", at: "r5c5", text: "!" })
  .build(); // -> plain PuzzleDefinition (the artifact)`;

interface GridDims {
    width: number;
    height: number;
    boxWidth: number;
    boxHeight: number;
}

/** The real box size that a grid resolves to, with the sqrt-based default.
 *  So the dimension inputs always show the real applied value and never a silent guess. */
const readDims = (def: PuzzleDefinition | undefined): GridDims | undefined => {
    if (!def) return undefined;
    try {
        if (def.geometry.type !== "grid") return undefined;
        const geometry = new GridGeometry(def.geometry);
        return {
            width: geometry.width,
            height: geometry.height,
            boxWidth: geometry.boxWidth,
            boxHeight: geometry.boxHeight,
        };
    } catch {
        return undefined;
    }
};

const EDITOR_TABS: { mode: EditorMode; label: string }[] = [
    { mode: "json", label: "JSON" },
    { mode: "visual", label: "Visual" },
    { mode: "code", label: "Code" },
];

/** One entry of the author undo history: the puzzle JSON and the pinned tools of the visual builder. */
interface Snapshot {
    text: string;
    tools: readonly string[];
}

const DEFAULT_DIMS: GridDims = { width: 9, height: 9, boxWidth: 3, boxHeight: 3 };

export default function Author() {
    const [text, setText] = useState(() => JSON.stringify(demoMixed, null, 2));
    const [submitted, setSubmitted] = useState(text);
    // The result is tagged with the `submitted` string it was computed for.
    // So an old result from a previous puzzle never shows for the puzzle that is loaded now.
    // This is simpler than a clear at every call site that can change `submitted`.
    const [solving, setSolving] = useState(false);
    const [settings, setSetting] = useSettings();
    const editorMode = settings.authorEditorMode;
    const setEditorMode = (mode: EditorMode) => setSetting("authorEditorMode", mode);
    usePageHeader(
        "Author a puzzle",
        "A puzzle is a JSON file. You can make a new variant without a new engine release. Edit the definition below to see a live preview. Each puzzle uses generic constraints and definition references.",
    );

    // Undo/redo for changes made *to the puzzle*.
    // These are visual-builder placements, grid-size edits, imports, and loading an example.
    // The Undo/Redo of the board (and Ctrl+Z) shows them, through externalHistory of PuzzlePlayer.
    // That history tries the digits entered on the board first.
    // Typing in the JSON box keeps the native undo of the textarea.
    // The snapshots here cover what that undo cannot see, because they replace the text from code.
    //
    // A snapshot is the puzzle text *and* the toolbox of the visual builder (its pinned tools).
    // So undo also puts back a tool that you just pinned or removed.
    const tools = settings.builderTools;

    // The Code tab shows the loaded puzzle as PuzzleBuilder code.
    // It is always in step with the JSON and Visual tabs.
    // Typing starts a draft. The draft stays until you Run or Discard.
    // Run replaces the puzzle, so undo steps back. This is the same as a paste of the JSON that the code builds.
    const [codeDraft, setCodeDraft] = useState<string>();
    const [codeError, setCodeError] = useState<string>();
    const runCode = () => {
        try {
            const built: unknown = new Function("PuzzleBuilder", code)(PuzzleBuilder);
            // A missing final .build() is an easy mistake, so call it here.
            const artifact = built instanceof PuzzleBuilder ? built.build() : built;
            if (!artifact || typeof artifact !== "object") {
                throw new Error(
                    "The code must return the puzzle. End the code with `return PuzzleBuilder.create(…)….build();`",
                );
            }
            applyText(JSON.stringify(artifact, null, 2));
            setCodeDraft(undefined);
            setCodeError(undefined);
        } catch (e) {
            setCodeError(e instanceof Error ? e.message : String(e));
        }
    };
    const [history, setHistory] = useState<{ past: readonly Snapshot[]; future: readonly Snapshot[] }>({
        past: [],
        future: [],
    });
    const restore = (snapshot: Snapshot) => {
        setText(snapshot.text);
        setSubmitted(snapshot.text);
        setSetting("builderTools", snapshot.tools);
    };
    /** One undoable step: change the puzzle text, the toolbox, or both. */
    const applyChange = (change: { text?: string; tools?: readonly string[] }) => {
        const next = { text: change.text ?? text, tools: change.tools ?? tools };
        if (next.text !== text || next.tools.join() !== tools.join()) {
            setHistory((h) => ({ past: [...h.past, { text, tools }].slice(-HISTORY_LIMIT), future: [] }));
        }
        setText(next.text);
        setSubmitted(next.text);
        setSetting("builderTools", next.tools);
    };
    const applyText = (json: string) => applyChange({ text: json });
    const undo = () => {
        const prev = history.past[history.past.length - 1];
        if (prev === undefined) return;
        setHistory({ past: history.past.slice(0, -1), future: [{ text, tools }, ...history.future] });
        restore(prev);
    };
    const redo = () => {
        const [next, ...rest] = history.future;
        if (next === undefined) return;
        setHistory({ past: [...history.past, { text, tools }], future: rest });
        restore(next);
    };

    const loadExample = (id: string) => {
        const example = listPuzzles().find((p) => p.metadata.id === id);
        if (!example) return;
        const json = JSON.stringify(example, null, 2);
        applyText(json);
    };

    // The text is parsed and compiled on every keystroke.
    // Both steps take less than a millisecond, even for the largest puzzle in the repo (measured).
    // So the border of the textarea can show the validity live.
    // Compiling does not apply anything.
    // `submitted` (and so the board preview) takes `text` only when `text` is valid.
    // The update happens during render, just below. React documents this as the alternative
    // to an effect to "derive state from a change in other state".
    // So an invalid state during an edit never blanks or remounts the last-good preview.
    const liveParsed = useMemo(() => parsePuzzle(text), [text]);
    const liveDef = liveParsed instanceof Error ? undefined : liveParsed;
    const liveError = useMemo(() => {
        if (liveParsed instanceof Error) return liveParsed.message;
        // validateSolution: false here too.
        // A constraint that conflicts with the declared solution must not stop the edit from reaching the preview.
        // (`result` below highlights the constraint in red instead.)
        // Only a *structural* problem must still block submission and keep the last-good preview.
        const compiled = compilePuzzle(liveParsed, definitions, { validateSolution: false });
        return compiled instanceof Error ? compiled.message : undefined;
    }, [liveParsed]);

    const [appliedText, setAppliedText] = useState(text);
    if (text !== appliedText) {
        setAppliedText(text);
        if (!liveError) setSubmitted(text);
    }

    const dims = readDims(liveDef) ?? DEFAULT_DIMS;

    const setDims = (patch: Partial<GridDims>) => {
        if (!liveDef) return;
        const next = { ...dims, ...patch };
        if (Object.values(next).some((n) => !Number.isFinite(n))) return;

        // A change of the box shape regroups the cells that must be mutually different.
        // An existing solution was solved for the old shape only.
        // So it is not only stale. It is almost certainly wrong.
        // Drop it. Do not leave the JSON with a "rule" that the buttons no longer agree with.
        const boxChanged = next.boxWidth !== dims.boxWidth || next.boxHeight !== dims.boxHeight;
        const updated: PuzzleDefinition = {
            ...liveDef,
            geometry: { type: "grid", ...next },
        };
        if (boxChanged) delete updated.solution;
        const json = JSON.stringify(updated, null, 2);
        applyText(json);
    };

    const handleVisualChange = (next: PuzzleDefinition) => {
        const json = JSON.stringify(next, null, 2);
        applyText(json);
    };

    const result = useMemo(() => {
        const parsed = parsePuzzle(submitted);
        if (parsed instanceof Error) return { error: parsed.message };
        // A declared solution that conflicts with a constraint must still show to the user.
        // But the whole preview must not go blank for it.
        // That is bad during a drag in the visual builder, because the dragged item would vanish.
        // validateSolution: false compiles the puzzle anyway.
        // invalidConstraintIds (below) highlights the constraints that conflict.
        const compiled = compilePuzzle(parsed, definitions, { validateSolution: false });
        if (compiled instanceof Error) return { error: compiled.message, parsed };
        return { compiled, parsed };
    }, [submitted]);

    // The code that the Code tab shows: your draft, or else the loaded puzzle printed as code.
    // The tab shows the sample while the JSON does not parse.
    const generatedCode = useMemo(() => {
        if (!("parsed" in result) || !result.parsed) return BUILDER_EXAMPLE;
        try {
            return puzzleToCode(result.parsed);
        } catch {
            return BUILDER_EXAMPLE;
        }
    }, [result]);
    const code = codeDraft ?? generatedCode;

    // While the puzzle does not compile, there is no board.
    // So the player gives no Undo button and no Ctrl+Z handler.
    // But an edit that broke the puzzle (for example, a grid size it cannot satisfy) is when you need to step back.
    // So in that state the page handles Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y itself.
    // Text fields keep their native undo.
    const hasBoard = "compiled" in result && !!result.compiled;
    useEffect(() => {
        if (hasBoard) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            const target = e.target as HTMLElement | null;
            if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
            const key = e.key.toLowerCase();
            if (key === "z") {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if (key === "y") {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    });

    const invalidConstraintIds = useMemo(
        () => ("compiled" in result && result.compiled ? solutionViolations(result.compiled) : new Set<string>()),
        [result],
    );

    const [boardSelection, setBoardSelection] = useState<ReadonlySet<CellId>>(new Set());
    const visualState = useVisualBuilder(
        "parsed" in result ? result.parsed : undefined,
        boardSelection,
        handleVisualChange,
        {
            tools,
            onChange: (nextTools, nextDef) =>
                applyChange({ tools: nextTools, text: nextDef && JSON.stringify(nextDef, null, 2) }),
        },
    );
    const [showSolution, setShowSolution] = useState(false);
    // "Test as solver": the preview becomes the plain player that a solver gets.
    // It has none of the author extras.
    // The extras are builder hooks, red conflict marking, solution overlay, and puzzle-edit undo history.
    // So the author can play their own puzzle. The setting lasts for one session.
    const [testing, setTesting] = useState(false);

    const runSolve = async () => {
        if (!("compiled" in result) || !result.compiled || solving) return;
        setSolving(true);
        const puzzle = result.compiled;
        const t0 = performance.now();
        // solve() yields to the event loop at intervals.
        // So this await does not freeze the page, even for a search of many seconds.
        const solved = await solve(puzzle);
        const ms = Math.round(performance.now() - t0);
        toast(
            `${SOLVE_STATUS_LABEL[solved.status]}\n(${ms}ms, ${solved.probes} oracle probe${solved.probes === 1 ? "" : "s"})`,
            {
                kind: solved.status === "unique" ? "success" : solved.status === "unknown" ? "info" : "error",
                key: "solve",
            },
        );
        setSolving(false);
    };

    const SOLVE_STATUS_LABEL: Record<SolveResult["status"], string> = {
        unique: "Unique solution.",
        multiple: "Multiple solutions.",
        none: "No solution. The givens conflict.",
        unknown: "The check timed out. The result is unknown.",
    };

    const shareLink =
        "parsed" in result && result.parsed ? `${window.location.origin}/p/${encodePuzzle(result.parsed)}` : undefined;

    const interop = useAuthorInterop("parsed" in result ? result.parsed : undefined, applyText);

    const exampleItems: MenuItem[] = listPuzzles().map((p) => ({
        label: p.metadata.title,
        onSelect: () => {
            setCodeDraft(undefined); // the Code tab must show the example, not an old draft
            loadExample(p.metadata.id);
        },
    }));
    const previewBar = (
        <div className="author-preview-bar">
            <span className="segmented" role="group" aria-label="Preview mode">
                <button
                    type="button"
                    className={testing ? undefined : "active"}
                    aria-pressed={!testing}
                    onClick={() => setTesting(false)}
                >
                    Edit
                </button>
                <button
                    type="button"
                    className={testing ? "active" : undefined}
                    aria-pressed={testing}
                    onClick={() => setTesting(!testing)}
                >
                    Test as solver
                </button>
            </span>
            {!testing && (
                <span className="author-preview-history">
                    <button
                        type="button"
                        className="btn btn-flat btn-icon"
                        aria-label="Undo puzzle edit"
                        disabled={history.past.length === 0}
                        onClick={undo}
                    >
                        <Undo2 size={16} />
                    </button>
                    <button
                        type="button"
                        className="btn btn-flat btn-icon"
                        aria-label="Redo puzzle edit"
                        disabled={history.future.length === 0}
                        onClick={redo}
                    >
                        <Redo2 size={16} />
                    </button>
                </span>
            )}
            {!testing && invalidConstraintIds.size > 0 && (
                // This is in the bar (one row that is always there), not in a paragraph above the board.
                // So when it appears, it never pushes the board down.
                <span className="author-conflict" role="status" tabIndex={0}>
                    <TriangleAlert size={15} aria-hidden="true" />
                    <span className="author-conflict-text">
                        Conflicts with the solution: {summarizeConflicts(invalidConstraintIds)}
                    </span>
                    <span className="author-conflict-count">{invalidConstraintIds.size}</span>
                    <span className="author-conflict-tip">
                        These conflict with the declared solution (shown in red):{" "}
                        {summarizeConflicts(invalidConstraintIds)}
                    </span>
                </span>
            )}
            {!testing && "compiled" in result && result.compiled?.solution && (
                <button
                    type="button"
                    className={`btn btn-sm btn-ghost ${showSolution ? "active" : ""}`}
                    aria-pressed={showSolution}
                    aria-label="Show solution"
                    onClick={() => setShowSolution(!showSolution)}
                >
                    {showSolution ? <EyeOff size={15} /> : <Eye size={15} />}
                    <span className="author-bar-text">Show solution</span>
                </button>
            )}
        </div>
    );
    const canExport = "parsed" in result && !!result.parsed;
    const interopItems: MenuItem[] = [
        { label: "Import from f-puzzles", icon: <FPuzzlesIcon />, onSelect: () => interop.openImport("fpuzzles") },
        {
            label: "Import from SudokuMaker",
            icon: <SudokuMakerIcon />,
            onSelect: () => interop.openImport("sudokumaker"),
        },
        ...(canExport
            ? [
                  { label: "Open in f-puzzles", icon: <FPuzzlesIcon />, onSelect: () => interop.exportTo("fpuzzles") },
                  {
                      label: "Open in SudokuPad",
                      icon: <SudokuPadIcon />,
                      onSelect: () => interop.exportTo("sudokupad"),
                  },
                  {
                      label: "Open in SudokuMaker",
                      icon: <SudokuMakerIcon />,
                      onSelect: () => interop.exportTo("sudokumaker"),
                  },
              ]
            : []),
    ];

    return (
        <div className="author">
            <div className={`author-grid${testing ? " author-grid--testing" : ""}`}>
                <div className="author-editor">
                    {liveDef?.geometry.type === "composite" ? (
                        <p className="author-hint">
                            This puzzle has several grids in one space ({describeGeometry(liveDef.geometry)}). Edit the
                            layout in the JSON.
                        </p>
                    ) : (
                        <div className="author-dims">
                            <div className="author-dims-group" role="group" aria-labelledby="author-dims-grid">
                                <span id="author-dims-grid" className="author-dims-label">
                                    Grid
                                </span>
                                <DimInput label="Width" value={dims.width} onCommit={(n) => setDims({ width: n })} />
                                <span className="author-dims-x" aria-hidden="true">
                                    ×
                                </span>
                                <DimInput label="Height" value={dims.height} onCommit={(n) => setDims({ height: n })} />
                            </div>
                            <div className="author-dims-group" role="group" aria-labelledby="author-dims-box">
                                <span id="author-dims-box" className="author-dims-label">
                                    Box
                                </span>
                                <DimInput
                                    label="Box width"
                                    value={dims.boxWidth}
                                    onCommit={(n) => setDims({ boxWidth: n })}
                                />
                                <span className="author-dims-x" aria-hidden="true">
                                    ×
                                </span>
                                <DimInput
                                    label="Box height"
                                    value={dims.boxHeight}
                                    onCommit={(n) => setDims({ boxHeight: n })}
                                />
                            </div>
                        </div>
                    )}
                    <div className="author-mode-bar">
                        <div className="segmented" role="tablist">
                            {EDITOR_TABS.map((tab) => (
                                <button
                                    key={tab.mode}
                                    type="button"
                                    role="tab"
                                    aria-selected={editorMode === tab.mode}
                                    className={editorMode === tab.mode ? "active" : undefined}
                                    onClick={() => setEditorMode(tab.mode)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <OverflowMenu label="Load an example" text="Load example" quiet items={exampleItems} />
                    </div>
                    {editorMode === "json" ? (
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            spellCheck={false}
                            className={liveError ? "invalid" : undefined}
                        />
                    ) : editorMode === "visual" ? (
                        <VisualBuilder def={"parsed" in result ? result.parsed : undefined} state={visualState} />
                    ) : (
                        <div className="author-sdk">
                            <textarea
                                value={code}
                                onChange={(e) => setCodeDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                        e.preventDefault();
                                        runCode();
                                    }
                                }}
                                spellCheck={false}
                                aria-label="PuzzleBuilder code"
                                className={codeError ? "invalid" : undefined}
                            />
                            {codeError && <pre className="author-error">{codeError}</pre>}
                            <div className="author-code-actions">
                                <button type="button" className="btn btn-sm" onClick={runCode}>
                                    Run
                                </button>
                                {codeDraft !== undefined && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setCodeDraft(undefined)}
                                    >
                                        Discard edits
                                    </button>
                                )}
                                <span className="author-code-hint">
                                    {codeDraft !== undefined ? "Edited. Not run yet. " : ""}Ctrl/⌘ + Enter
                                </span>
                            </div>
                        </div>
                    )}
                    {liveError && <pre className="author-error">{liveError}</pre>}
                    <div className="author-actions">
                        {"compiled" in result && result.compiled && (
                            <button className="btn btn-primary" onClick={runSolve} disabled={solving}>
                                {solving ? "Checking…" : "Check uniqueness"}
                            </button>
                        )}
                        {shareLink && (
                            <button
                                className="btn btn-sm btn-ghost"
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(shareLink);
                                    } catch {
                                        window.prompt("Share link:", shareLink);
                                    }
                                }}
                            >
                                Copy share link
                            </button>
                        )}
                        <OverflowMenu label="Import / Export" text="Import / Export" quiet up items={interopItems} />
                    </div>
                </div>

                <div className={`author-preview${testing ? "" : " author-preview--editing"}`}>
                    {"compiled" in result && result.compiled ? (
                        <>
                            {testing ? (
                                <PuzzlePlayer
                                    key={`${result.compiled.metadata.id}${submitted.length}-test`}
                                    puzzle={result.compiled}
                                    header={previewBar}
                                />
                            ) : (
                                <PuzzlePlayer
                                    key={result.compiled.metadata.id + submitted.length}
                                    puzzle={result.compiled}
                                    header={previewBar}
                                    onSelectionChange={setBoardSelection}
                                    externalHistory={{
                                        canUndo: history.past.length > 0,
                                        canRedo: history.future.length > 0,
                                        undo,
                                        redo,
                                    }}
                                    onSelectionEnd={visualState.onBoardSelectionEnd}
                                    previewObjects={visualState.previewObjects}
                                    invalidConstraintIds={invalidConstraintIds}
                                    showSolution={showSolution}
                                    keepFooter
                                />
                            )}
                        </>
                    ) : (
                        <p className="author-hint">Fix the errors on the left to see a preview.</p>
                    )}
                </div>
            </div>

            {interop.dialog && <ImportDialog {...interop.dialog} />}
        </div>
    );
}
