import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Import } from "lucide-react";

import { toast } from "@/app/toast.ts";
import { useSettings } from "@/app/use_settings.ts";
import { compilePuzzle, solutionViolations } from "@/runtime/compile.ts";
import { GridGeometry } from "@/runtime/geometry.ts";
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
import { usePageHeader } from "@/app/page_header.ts";
import sudokuMakerIcon from "./sudokumaker-icon.png";
import sudokuPadIcon from "./sudokupad-icon.png";

import "./style.css";

const FPuzzlesIcon = () => (
    <span className="author-icon author-icon-f" aria-hidden="true">
        F
    </span>
);

const SudokuMakerIcon = () => (
    <img className="author-icon" src={sudokuMakerIcon} alt="" width={16} height={16} />
);

const SudokuPadIcon = () => <img className="author-icon" src={sudokuPadIcon} alt="" width={16} height={16} />;

/** "antiking#56, antiking#73, thermometer#2" → "antiking ×2, thermometer#2" — a
 *  global rule can violate at hundreds of cell pairs, so listing every id made
 *  the notice a wall of text. */
const summarizeConflicts = (ids: ReadonlySet<string>): string => {
    const byKind = new Map<string, string[]>();
    for (const id of ids) {
        const kind = id.split("#")[0];
        byKind.set(kind, [...(byKind.get(kind) ?? []), id]);
    }
    return [...byKind].map(([kind, list]) => (list.length > 1 ? `${kind} ×${list.length}` : list[0])).join(", ");
};

/** Snapshots kept for author undo — each is a full JSON text, so keep it bounded. */
const HISTORY_LIMIT = 100;

const BUILDER_EXAMPLE = `import { PuzzleBuilder } from "@/authoring/builder";

// define puzzle + geometry
const artifact = PuzzleBuilder.create("thermo-demo", "Thermo Demo")
  .grid(9, 9)
  .domain([1, 2, 3, 4, 5, 6, 7, 8, 9])
  // add constraints (definitions compile to primitives)
  .use("sudoku")
  .use("thermometer", { cells: ["r1c1", "r1c2", "r1c3"] })
  // or a raw primitive, no definition involved
  .constraint(["==", ["sum", ["cells", "col:0"]], 45])
  // add a visual object the renderer draws generically
  .visual({ kind: "text", at: "r5c5", text: "!" })
  .build();            // -> plain PuzzleDefinition (the artifact)

// "publish" = serialize
localStorage.setItem(artifact.metadata.id, JSON.stringify(artifact));`;

interface GridDims {
    width: number;
    height: number;
    boxWidth: number;
    boxHeight: number;
}

/** The actual box size a grid resolves to, including the sqrt-based default — so the
 *  dimension inputs always show the real applied value, never a silent guess. */
const readDims = (def: PuzzleDefinition | undefined): GridDims | undefined => {
    if (!def) return undefined;
    try {
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

const DEFAULT_DIMS: GridDims = { width: 9, height: 9, boxWidth: 3, boxHeight: 3 };

export default function Author() {
    const [text, setText] = useState(() => JSON.stringify(demoMixed, null, 2));
    const [submitted, setSubmitted] = useState(text);
    // Tagged with the `submitted` string it was computed for, so a stale result
    // from a previous puzzle never shows for whatever is loaded now — simpler
    // than clearing it from every call site that can change `submitted`.
    const [solving, setSolving] = useState(false);
    const [settings, setSetting] = useSettings();
    const editorMode = settings.authorEditorMode;
    const setEditorMode = (mode: "json" | "visual") => setSetting("authorEditorMode", mode);
    usePageHeader(
        "Author a puzzle",
        "A puzzle is a JSON artifact — no engine release needed to invent a variant. Edit the definition below and preview it live. Everything is composed from generic constraints and definition references.",
    );

    // Undo/redo for changes made *to the puzzle* — visual-builder placements,
    // grid-size edits, imports, loading an example (#116). Surfaced through the
    // board's own Undo/Redo (and Ctrl+Z) via PuzzlePlayer's externalHistory, which
    // tries the board's entered digits first. Typing in the JSON box keeps the
    // textarea's own native undo; the snapshots here are what that can't see,
    // because they replace the text programmatically.
    const [history, setHistory] = useState<{ past: readonly string[]; future: readonly string[] }>({ past: [], future: [] });
    const applyText = (json: string) => {
        if (json !== text) setHistory((h) => ({ past: [...h.past, text].slice(-HISTORY_LIMIT), future: [] }));
        setText(json);
        setSubmitted(json);
    };
    const undo = () => {
        const prev = history.past[history.past.length - 1];
        if (prev === undefined) return;
        setHistory({ past: history.past.slice(0, -1), future: [text, ...history.future] });
        setText(prev);
        setSubmitted(prev);
    };
    const redo = () => {
        const [next, ...rest] = history.future;
        if (next === undefined) return;
        setHistory({ past: [...history.past, text], future: rest });
        setText(next);
        setSubmitted(next);
    };

    const loadExample = (id: string) => {
        const example = listPuzzles().find((p) => p.metadata.id === id);
        if (!example) return;
        const json = JSON.stringify(example, null, 2);
        applyText(json);
    };

    // Parsed and compiled on every keystroke (both are sub-millisecond even for
    // the largest puzzle in the repo — measured, not assumed) so the textarea's
    // border can track validity live. Compiling doesn't apply anything by
    // itself; `submitted` (and so the board preview) only ever picks up `text`
    // once it's actually valid — adjusted during render just below, React's
    // documented alternative to an effect for "derive state from a change in
    // other state" — so a mid-edit invalid state never blanks or remounts the
    // last-good preview.
    const liveParsed = useMemo(() => parsePuzzle(text), [text]);
    const liveDef = liveParsed instanceof Error ? undefined : liveParsed;
    const liveError = useMemo(() => {
        if (liveParsed instanceof Error) return liveParsed.message;
        // validateSolution: false here too -- a constraint that conflicts with
        // the declared solution shouldn't withhold the whole edit from ever
        // reaching the preview (see `result` below, which highlights it in red
        // instead); only a *structural* problem should still block submission
        // and keep showing the last-good preview.
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

        // Changing the box shape regroups which cells must be mutually different —
        // any existing solution was only ever solved for the old shape, so it's
        // not just stale, it's almost certainly wrong. Drop it rather than leave
        // the JSON holding a "rule" the buttons no longer agree with.
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
        // A declared solution that conflicts with a constraint is still worth
        // surfacing, but not by blanking out the whole preview over it (that's
        // especially rough mid-drag in the visual builder, where the thing you
        // were just dragging would simply vanish) — validateSolution: false
        // compiles anyway, and invalidConstraintIds (below) highlights exactly
        // which constraint(s) conflict instead.
        const compiled = compilePuzzle(parsed, definitions, { validateSolution: false });
        if (compiled instanceof Error) return { error: compiled.message, parsed };
        return { compiled, parsed };
    }, [submitted]);

    // While the puzzle doesn't compile there's no board, hence no Undo button or
    // Ctrl+Z handler from the player — and an edit that broke the puzzle (a grid
    // size it can't satisfy, say) is exactly when you want to step back. So the
    // page answers Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y itself in that state, leaving
    // text fields their native undo.
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
    const visualState = useVisualBuilder("parsed" in result ? result.parsed : undefined, boardSelection, handleVisualChange);
    const [showSolution, setShowSolution] = useState(false);

    const runSolve = async () => {
        if (!("compiled" in result) || !result.compiled || solving) return;
        setSolving(true);
        const puzzle = result.compiled;
        const t0 = performance.now();
        // solve() yields back to the event loop periodically, so this await
        // doesn't freeze the page even for a multi-second search.
        const solved = await solve(puzzle);
        const ms = Math.round(performance.now() - t0);
        toast(
            `${SOLVE_STATUS_LABEL[solved.status]}\n(${ms}ms, ${solved.probes} oracle probe${solved.probes === 1 ? "" : "s"})`,
            { kind: solved.status === "unique" ? "success" : solved.status === "unknown" ? "info" : "error", key: "solve" },
        );
        setSolving(false);
    };

    const SOLVE_STATUS_LABEL: Record<SolveResult["status"], string> = {
        unique: "Unique solution.",
        multiple: "Multiple solutions.",
        none: "No solution. The givens conflict.",
        unknown: "Timed out before finishing. Result unknown.",
    };

    const shareLink =
        "parsed" in result && result.parsed
            ? `${window.location.origin}/p/${encodePuzzle(result.parsed)}`
            : undefined;

    const interop = useAuthorInterop("parsed" in result ? result.parsed : undefined, applyText);

    return (
        <div className="author">
            <div className="author-grid">
                <div className="author-editor">
                    <label className="author-example">
                        Load an example:{" "}
                        <select defaultValue="" onChange={(e) => loadExample(e.target.value)}>
                            <option value="" disabled>
                                choose a puzzle…
                            </option>
                            {listPuzzles().map((p) => (
                                <option key={p.metadata.id} value={p.metadata.id}>
                                    {p.metadata.title}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="author-dims">
                        <fieldset className="author-dims-group">
                            <legend>Grid size</legend>
                            <div className="author-dims-pair">
                                <DimInput label="Width" value={dims.width} onCommit={(n) => setDims({ width: n })} />
                                <span className="author-dims-x" aria-hidden="true">
                                    ×
                                </span>
                                <DimInput label="Height" value={dims.height} onCommit={(n) => setDims({ height: n })} />
                            </div>
                        </fieldset>
                        <fieldset className="author-dims-group">
                            <legend>Box size</legend>
                            <div className="author-dims-pair">
                                <DimInput label="Box width" value={dims.boxWidth} onCommit={(n) => setDims({ boxWidth: n })} />
                                <span className="author-dims-x" aria-hidden="true">
                                    ×
                                </span>
                                <DimInput label="Box height" value={dims.boxHeight} onCommit={(n) => setDims({ boxHeight: n })} />
                            </div>
                        </fieldset>
                    </div>
                    <div className="author-mode-tabs" role="tablist">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={editorMode === "json"}
                            className={`btn btn-sm ${editorMode === "json" ? "active" : ""}`}
                            onClick={() => setEditorMode("json")}
                        >
                            JSON
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={editorMode === "visual"}
                            className={`btn btn-sm ${editorMode === "visual" ? "active" : ""}`}
                            onClick={() => setEditorMode("visual")}
                        >
                            Visual
                        </button>
                    </div>
                    {editorMode === "json" ? (
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            spellCheck={false}
                            className={liveError ? "invalid" : undefined}
                        />
                    ) : (
                        <VisualBuilder def={"parsed" in result ? result.parsed : undefined} state={visualState} />
                    )}
                    {liveError && <pre className="author-error">{liveError}</pre>}
                    <div className="author-actions">
                        {"compiled" in result && result.compiled && (
                            <button className="btn" onClick={runSolve} disabled={solving}>
                                {solving ? "Checking…" : "Check uniqueness"}
                            </button>
                        )}
                        {shareLink && (
                            <button
                                className="btn"
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
                    </div>
                    <div className="author-interop">
                        <div className="author-interop-group">
                            <span className="author-format-badge" aria-hidden="true">
                                <FPuzzlesIcon />
                            </span>
                            <button
                                className="btn btn-icon"
                                onClick={() => interop.openImport("fpuzzles")}
                                aria-label="Import from f-puzzles"
                                title="Import from f-puzzles"
                            >
                                <Import size={15} />
                            </button>
                            {"parsed" in result && result.parsed && (
                                <button
                                    className="btn btn-icon"
                                    onClick={() => interop.exportTo("fpuzzles")}
                                    aria-label="Export to f-puzzles (opens in a new tab)"
                                    title="Export to f-puzzles (opens in a new tab)"
                                >
                                    <ExternalLink size={15} />
                                </button>
                            )}
                        </div>
                        <div className="author-interop-group">
                            <span className="author-format-badge" aria-hidden="true">
                                <SudokuMakerIcon />
                            </span>
                            <button
                                className="btn btn-icon"
                                onClick={() => interop.openImport("sudokumaker")}
                                aria-label="Import from SudokuMaker"
                                title="Import from SudokuMaker"
                            >
                                <Import size={15} />
                            </button>
                            {"parsed" in result && result.parsed && (
                                <button
                                    className="btn btn-icon"
                                    onClick={() => interop.exportTo("sudokumaker")}
                                    aria-label="Export to SudokuMaker (opens in a new tab)"
                                    title="Export to SudokuMaker (opens in a new tab)"
                                >
                                    <ExternalLink size={15} />
                                </button>
                            )}
                        </div>
                        <div className="author-interop-group">
                            <span className="author-format-badge" aria-hidden="true">
                                <SudokuPadIcon />
                            </span>
                            <span aria-hidden="true" />
                            {"parsed" in result && result.parsed && (
                                <button
                                    className="btn btn-icon"
                                    onClick={() => interop.exportTo("sudokupad")}
                                    aria-label="Export to SudokuPad (opens in a new tab)"
                                    title="Export to SudokuPad (opens in a new tab)"
                                >
                                    <ExternalLink size={15} />
                                </button>
                            )}
                        </div>
                    </div>

                    <details className="author-sdk">
                        <summary>Build it in code instead</summary>
                        <p>
                            The <code>PuzzleBuilder</code> produces the exact same artifact. This is the seam a
                            hosted editor would be built on.
                        </p>
                        <pre>{BUILDER_EXAMPLE}</pre>
                    </details>
                </div>

                <div className="author-preview">
                    {"compiled" in result && result.compiled ? (
                        <>
                            {result.compiled.solution && (
                                <button
                                    type="button"
                                    className={`btn pp-toggle ${showSolution ? "active" : ""}`}
                                    aria-pressed={showSolution}
                                    onClick={() => setShowSolution(!showSolution)}
                                >
                                    Show solution
                                </button>
                            )}
                            {invalidConstraintIds.size > 0 && (
                                <p className="author-notice">
                                    Conflicts with the declared solution (shown in red): {summarizeConflicts(invalidConstraintIds)}
                                </p>
                            )}
                            <PuzzlePlayer
                                key={result.compiled.metadata.id + submitted.length}
                                puzzle={result.compiled}
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
                            />
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
