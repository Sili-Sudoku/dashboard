import { useMemo, useState, type WheelEvent } from "react";
import { ExternalLink, Import } from "lucide-react";

import { compilePuzzle } from "@/runtime/compile.ts";
import { GridGeometry } from "@/runtime/geometry.ts";
import { parsePuzzle, encodePuzzle } from "@/runtime/serialization.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import { definitions } from "@/definitions/index.ts";
import { demoMixed, listPuzzles } from "@/puzzles/index.ts";
import PuzzlePlayer from "@/player/PuzzlePlayer.tsx";
import { encodeFPuzzlesShareLink, exportFPuzzles, importFPuzzles } from "@/interop/fpuzzles.ts";
import { encodeSudokuMakerShareLink, exportSudokuMaker, importSudokuMaker } from "@/interop/sudokumaker.ts";
import { usePageHeader } from "@/app/page_header.ts";
import sudokuMakerIcon from "./sudokumaker-icon.png";

import "./style.css";

const FPuzzlesIcon = () => (
    <span className="author-icon author-icon-f" aria-hidden="true">
        F
    </span>
);

const SudokuMakerIcon = () => (
    <img className="author-icon" src={sudokuMakerIcon} alt="" width={16} height={16} />
);

// Number inputs change value on scroll-wheel while focused (standard browser behavior) —
// harmless normally, but these dim fields sit right above the page's own scrollable
// content, so scrolling past them silently rewrites the grid size. Blurring on wheel lets
// the scroll pass through to the page instead of being consumed as an increment/decrement.
const blurOnWheel = (e: WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

interface ImportDialogProps {
    title: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    onCancel: () => void;
    onSubmit: () => void;
}

/** An in-app replacement for `window.prompt`: browsers let a user permanently
 *  suppress native dialogs after a few show up (and the native one is a
 *  single-line input anyway, which is awkward for pasting multi-line JSON). */
const ImportDialog = ({ title, placeholder, value, onChange, onCancel, onSubmit }: ImportDialogProps) => (
    <div className="author-dialog-backdrop" onClick={onCancel}>
        <div
            className="author-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                if (e.key === "Escape") onCancel();
            }}
        >
            <h3>{title}</h3>
            <textarea
                autoFocus
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                spellCheck={false}
            />
            <div className="author-dialog-actions">
                <button className="secondary" onClick={onCancel}>
                    Cancel
                </button>
                <button onClick={onSubmit} disabled={!value.trim()}>
                    Import
                </button>
            </div>
        </div>
    </div>
);

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

type ImportFormat = "fpuzzles" | "sudokumaker";

export default function Author() {
    const [text, setText] = useState(() => JSON.stringify(demoMixed, null, 2));
    const [submitted, setSubmitted] = useState(text);
    const [interopNotice, setInteropNotice] = useState<string | undefined>();
    const [importDialog, setImportDialog] = useState<ImportFormat | undefined>();
    const [importDraft, setImportDraft] = useState("");
    usePageHeader(
        "Author a puzzle",
        "A puzzle is a JSON artifact — no engine release needed to invent a variant. Edit the definition below and preview it live. Everything is composed from generic constraints and definition references.",
    );

    const loadExample = (id: string) => {
        const example = listPuzzles().find((p) => p.metadata.id === id);
        if (!example) return;
        const json = JSON.stringify(example, null, 2);
        setText(json);
        setSubmitted(json);
    };

    const liveDef = useMemo(() => {
        const parsed = parsePuzzle(text);
        return parsed instanceof Error ? undefined : parsed;
    }, [text]);

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
        setText(json);
        setSubmitted(json);
    };

    const result = useMemo(() => {
        const parsed = parsePuzzle(submitted);
        if (parsed instanceof Error) return { error: parsed.message };
        const compiled = compilePuzzle(parsed, definitions);
        if (compiled instanceof Error) return { error: compiled.message, parsed };
        return { compiled, parsed };
    }, [submitted]);

    const shareLink =
        "parsed" in result && result.parsed
            ? `${window.location.origin}/p/${encodePuzzle(result.parsed)}`
            : undefined;

    const runImportFPuzzles = (pasted: string) => {
        const imported = importFPuzzles(pasted);
        if (imported instanceof Error) {
            setInteropNotice(`Import failed: ${imported.message}`);
            return;
        }
        const json = JSON.stringify(imported.puzzle, null, 2);
        setText(json);
        setSubmitted(json);
        setInteropNotice(
            imported.warnings.length > 0
                ? `Imported with ${imported.warnings.length} warning(s):\n${imported.warnings.join("\n")}`
                : "Imported f-puzzles JSON.",
        );
    };

    const handleExportFPuzzles = () => {
        if (!("parsed" in result) || !result.parsed) return;
        const exported = exportFPuzzles(result.parsed);
        if (exported instanceof Error) {
            setInteropNotice(`Export failed: ${exported.message}`);
            return;
        }
        const link = encodeFPuzzlesShareLink(exported.data);
        window.open(link, "_blank", "noopener,noreferrer");
        setInteropNotice(
            exported.warnings.length > 0
                ? `Opened in a new tab, with ${exported.warnings.length} warning(s):\n${exported.warnings.join("\n")}`
                : "Opened f-puzzles share link in a new tab.",
        );
    };

    const runImportSudokuMaker = (pasted: string) => {
        const imported = importSudokuMaker(pasted);
        if (imported instanceof Error) {
            setInteropNotice(`Import failed: ${imported.message}`);
            return;
        }
        const json = JSON.stringify(imported.puzzle, null, 2);
        setText(json);
        setSubmitted(json);
        setInteropNotice(
            imported.warnings.length > 0
                ? `Imported with ${imported.warnings.length} warning(s):\n${imported.warnings.join("\n")}`
                : "Imported SudokuMaker JSON.",
        );
    };

    const IMPORT_DIALOGS: Record<ImportFormat, { title: string; placeholder: string; run: (pasted: string) => void }> = {
        fpuzzles: {
            title: "Import from f-puzzles",
            placeholder: "Paste f-puzzles JSON or an f-puzzles.com share link…",
            run: runImportFPuzzles,
        },
        sudokumaker: {
            title: "Import from SudokuMaker",
            placeholder: "Paste SudokuMaker JSON or a sudokumaker.app share link…",
            run: runImportSudokuMaker,
        },
    };

    const openImportDialog = (format: ImportFormat) => {
        setImportDraft("");
        setImportDialog(format);
    };

    const closeImportDialog = () => {
        setImportDialog(undefined);
        setImportDraft("");
    };

    const submitImportDialog = () => {
        const draft = importDraft.trim();
        if (importDialog && draft) IMPORT_DIALOGS[importDialog].run(draft);
        closeImportDialog();
    };

    const handleExportSudokuMaker = () => {
        if (!("parsed" in result) || !result.parsed) return;
        const exported = exportSudokuMaker(result.parsed);
        if (exported instanceof Error) {
            setInteropNotice(`Export failed: ${exported.message}`);
            return;
        }
        const link = encodeSudokuMakerShareLink(exported.data);
        window.open(link, "_blank", "noopener,noreferrer");
        setInteropNotice(
            exported.warnings.length > 0
                ? `Opened in a new tab, with ${exported.warnings.length} warning(s):\n${exported.warnings.join("\n")}`
                : "Opened SudokuMaker share link in a new tab.",
        );
    };

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
                        <label>
                            Width
                            <input
                                type="number"
                                min={1}
                                value={dims.width}
                                onChange={(e) => setDims({ width: e.target.valueAsNumber })}
                                onWheel={blurOnWheel}
                            />
                        </label>
                        <label>
                            Height
                            <input
                                type="number"
                                min={1}
                                value={dims.height}
                                onChange={(e) => setDims({ height: e.target.valueAsNumber })}
                                onWheel={blurOnWheel}
                            />
                        </label>
                        <label>
                            Box width
                            <input
                                type="number"
                                min={1}
                                value={dims.boxWidth}
                                onChange={(e) => setDims({ boxWidth: e.target.valueAsNumber })}
                                onWheel={blurOnWheel}
                            />
                        </label>
                        <label>
                            Box height
                            <input
                                type="number"
                                min={1}
                                value={dims.boxHeight}
                                onChange={(e) => setDims({ boxHeight: e.target.valueAsNumber })}
                                onWheel={blurOnWheel}
                            />
                        </label>
                    </div>
                    <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
                    <div className="author-actions">
                        <button onClick={() => setSubmitted(text)}>Validate &amp; preview</button>
                        {shareLink && (
                            <button
                                className="secondary"
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
                                className="icon-button secondary"
                                onClick={() => openImportDialog("fpuzzles")}
                                aria-label="Import from f-puzzles"
                                title="Import from f-puzzles"
                            >
                                <Import size={15} />
                            </button>
                            {"parsed" in result && result.parsed && (
                                <button
                                    className="icon-button secondary"
                                    onClick={handleExportFPuzzles}
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
                                className="icon-button secondary"
                                onClick={() => openImportDialog("sudokumaker")}
                                aria-label="Import from SudokuMaker"
                                title="Import from SudokuMaker"
                            >
                                <Import size={15} />
                            </button>
                            {"parsed" in result && result.parsed && (
                                <button
                                    className="icon-button secondary"
                                    onClick={handleExportSudokuMaker}
                                    aria-label="Export to SudokuMaker (opens in a new tab)"
                                    title="Export to SudokuMaker (opens in a new tab)"
                                >
                                    <ExternalLink size={15} />
                                </button>
                            )}
                        </div>
                    </div>
                    {"error" in result && result.error && <pre className="author-error">{result.error}</pre>}
                    {interopNotice && <pre className="author-notice">{interopNotice}</pre>}

                    <section className="author-sdk">
                        <h2>…or build it in code</h2>
                        <p>
                            The <code>PuzzleBuilder</code> produces the exact same artifact. This is the seam a
                            hosted editor would be built on.
                        </p>
                        <pre>{BUILDER_EXAMPLE}</pre>
                    </section>
                </div>

                <div className="author-preview">
                    {"compiled" in result && result.compiled ? (
                        <PuzzlePlayer key={result.compiled.metadata.id + submitted.length} puzzle={result.compiled} />
                    ) : (
                        <p className="author-hint">Fix the errors on the left to see a preview.</p>
                    )}
                </div>
            </div>

            {importDialog && (
                <ImportDialog
                    title={IMPORT_DIALOGS[importDialog].title}
                    placeholder={IMPORT_DIALOGS[importDialog].placeholder}
                    value={importDraft}
                    onChange={setImportDraft}
                    onCancel={closeImportDialog}
                    onSubmit={submitImportDialog}
                />
            )}
        </div>
    );
}
