import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { Braces, Copy, Share2, X } from "lucide-react";

import { compilePuzzle } from "@/runtime/compile.ts";
import { decodePuzzle, encodePuzzle } from "@/runtime/serialization.ts";
import type { CompiledPuzzle, PuzzleDefinition } from "@/runtime/puzzle.ts";
import { definitions } from "@/definitions/index.ts";
import { getPuzzle } from "@/puzzles/index.ts";
import PuzzlePlayer from "@/player/PuzzlePlayer.tsx";
import { OverflowMenu } from "@/app/overflow_menu.tsx";
import { toast } from "@/app/toast.ts";
import { usePageHeader, usePageActionsSlot } from "@/app/page_header.ts";

import "./style.css";

interface Resolved {
    definition?: PuzzleDefinition;
    compiled?: CompiledPuzzle;
    error?: string;
}

const resolve = (ref: string | undefined): Resolved => {
    if (!ref) return { error: "No puzzle reference in the URL." };

    const fromRegistry = getPuzzle(ref);
    const definition = fromRegistry ?? decodePuzzle(ref);
    if (definition instanceof Error) return { error: definition.message };

    const compiled = compilePuzzle(definition, definitions);
    if (compiled instanceof Error) return { definition, error: compiled.message };

    return { definition, compiled };
};

type JsonView = "off" | "artifact" | "compiled";

export default function Play() {
    const { ref } = useParams();
    const { definition, compiled, error } = useMemo(() => resolve(ref), [ref]);
    const [copied, setCopied] = useState(false);
    const [jsonView, setJsonView] = useState<JsonView>("off");
    usePageHeader(
        definition?.metadata.title,
        definition?.metadata.description,
        definition?.metadata.author ? `by ${definition.metadata.author}` : undefined,
    );
    const actionsSlot = usePageActionsSlot();

    const share = async () => {
        if (!definition) return;
        const url = `${window.location.origin}/p/${encodePuzzle(definition)}`;
        await copyText(url, () => toast("Link copied", { kind: "success", key: "share" }));
    };

    if (error && !compiled) {
        return (
            <div className="play-error">
                <h2>Could not load this puzzle</h2>
                <p>{error}</p>
                <Link to="/">Back to puzzles</Link>
            </div>
        );
    }

    if (!compiled || !definition) return null;

    const jsonText =
        jsonView === "compiled"
            ? JSON.stringify(compiled, null, 2)
            : JSON.stringify(definition, null, 2);

    // Nothing here is part of solving, so the header has one menu, not two buttons.
    const actions = (
        <OverflowMenu
            label="Puzzle actions"
            items={[
                { label: "Share link", icon: <Share2 size={16} />, onSelect: share },
                {
                    label: jsonView === "off" ? "View JSON" : "Hide JSON",
                    icon: <Braces size={16} />,
                    onSelect: () => setJsonView((v) => (v === "off" ? "artifact" : "off")),
                },
            ]}
        />
    );

    return (
        <div className="play">
            {/* Portals into the action slot of the navbar (see app/page_header.ts) when
                rendered under AppRouter. Falls back to an inline header when no slot exists
                (for example, the tests of this component render it standalone). */}
            {actionsSlot ? createPortal(actions, actionsSlot) : <header className="play-header">{actions}</header>}

            <div className="play-body">
                {jsonView !== "off" && (
                    <section className="play-json">
                        <div className="pj-bar">
                            <div className="pj-tabs">
                                <button
                                    className={`btn btn-sm ${jsonView === "artifact" ? "active" : ""}`}
                                    onClick={() => setJsonView("artifact")}
                                >
                                    Artifact (authored)
                                </button>
                                <button
                                    className={`btn btn-sm ${jsonView === "compiled" ? "active" : ""}`}
                                    onClick={() => setJsonView("compiled")}
                                >
                                    Compiled (primitives the runtime sees)
                                </button>
                            </div>
                            <div className="pj-bar-right">
                                <button className="btn btn-sm" onClick={() => copyText(jsonText, setCopied)} title="Copy JSON">
                                    <Copy size={14} /> {copied ? "Copied" : "Copy"}
                                </button>
                                <button className="btn btn-sm" onClick={() => setJsonView("off")} title="Close" aria-label="Close">
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                        <p className="pj-note">
                            {jsonView === "artifact"
                                ? "The serializable puzzle definition — this is what a URL, file, or database row holds."
                                : "After compile: definition references are expanded, selectors resolved, and every constraint is a primitive expression tagged by its source."}
                        </p>
                        <pre>{jsonText}</pre>
                    </section>
                )}

                <div className="play-board">
                    <PuzzlePlayer key={definition.metadata.id} puzzle={compiled} />
                </div>
            </div>
        </div>
    );
}

const copyText = async (text: string, setCopied: (v: boolean) => void): Promise<void> => {
    try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    } catch {
        window.prompt("Copy:", text);
    }
};
