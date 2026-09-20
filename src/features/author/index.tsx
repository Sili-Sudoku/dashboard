import { useMemo, useState } from "react";

import { compilePuzzle } from "@/runtime/compile.ts";
import { parsePuzzle, encodePuzzle } from "@/runtime/serialization.ts";
import { definitions } from "@/definitions/index.ts";
import { demoMixed, listPuzzles } from "@/puzzles/index.ts";
import PuzzlePlayer from "@/player/PuzzlePlayer.tsx";

import "./style.css";

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

export default function Author() {
    const [text, setText] = useState(() => JSON.stringify(demoMixed, null, 2));
    const [submitted, setSubmitted] = useState(text);

    const loadExample = (id: string) => {
        const example = listPuzzles().find((p) => p.metadata.id === id);
        if (!example) return;
        const json = JSON.stringify(example, null, 2);
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

    return (
        <div className="author">
            <section>
                <h1>Author a puzzle</h1>
                <p>
                    A puzzle is a JSON artifact — no engine release needed to invent a variant. Edit the
                    definition below and preview it live. Everything is composed from generic constraints
                    and definition references.
                </p>
            </section>

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
                    <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
                    <div className="author-actions">
                        <button onClick={() => setSubmitted(text)}>Validate &amp; preview</button>
                        {shareLink && (
                            <button
                                onClick={() => {
                                    navigator.clipboard
                                        ?.writeText(shareLink)
                                        .catch(() => window.prompt("Share link:", shareLink));
                                }}
                            >
                                Copy share link
                            </button>
                        )}
                    </div>
                    {"error" in result && result.error && <pre className="author-error">{result.error}</pre>}
                </div>

                <div className="author-preview">
                    {"compiled" in result && result.compiled ? (
                        <PuzzlePlayer key={result.compiled.metadata.id + submitted.length} puzzle={result.compiled} />
                    ) : (
                        <p className="author-hint">Fix the errors on the left to see a preview.</p>
                    )}
                </div>
            </div>

            <section className="author-sdk">
                <h2>…or build it in code</h2>
                <p>
                    The <code>PuzzleBuilder</code> produces the exact same artifact. This is the seam a
                    hosted editor would be built on.
                </p>
                <pre>{BUILDER_EXAMPLE}</pre>
            </section>
        </div>
    );
}
