import ConfirmDialog from "@/app/confirm_dialog.tsx";
import { parseSourceUrl, sourceHost } from "@/runtime/source_link.ts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { Braces, Copy, ExternalLink, Share2, X } from "lucide-react";

import { compilePuzzle } from "@/runtime/compile.ts";
import { solve } from "@/runtime/solver.ts";
import { decodePuzzle, encodePuzzle } from "@/runtime/serialization.ts";
import type { CompiledPuzzle, PuzzleDefinition } from "@/runtime/puzzle.ts";
import { definitions } from "@/definitions/index.ts";
import { getPuzzle } from "@/puzzles/index.ts";
import PuzzlePlayer from "@/player/PuzzlePlayer.tsx";
import { OverflowMenu } from "@/app/overflow_menu.tsx";
import { toast } from "@/app/toast.ts";
import { useSettings } from "@/app/use_settings.ts";
import { usePageHeader, usePageActionsSlot } from "@/app/page_header.ts";

import "@/app/error_boundary.css";
import "./style.css";

interface Resolved {
    definition?: PuzzleDefinition;
    compiled?: CompiledPuzzle;
    error?: string;
}

const resolve = (ref: string | undefined): Resolved => {
    if (!ref) return { error: "The URL has no puzzle reference." };

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
    const [settings, setSetting] = useSettings();
    const resolved = useMemo(() => resolve(ref), [ref]);
    const { definition, error } = resolved;
    const [found, setFound] = useState<{ source: CompiledPuzzle; solution: NonNullable<CompiledPuzzle["solution"]> }>();

    // A shared or imported puzzle may carry no solution, and Check needs one. Look for it here, and use it only
    // when it is the single solution, as "correct" would mean nothing otherwise.
    const unsolved = resolved.compiled && !resolved.compiled.solution ? resolved.compiled : undefined;
    useEffect(() => {
        if (!unsolved) return;
        let stale = false;
        void solve(unsolved).then((r) => {
            if (!stale && r.status === "unique" && r.solution) setFound({ source: unsolved, solution: r.solution });
        });
        return () => {
            stale = true;
        };
    }, [unsolved]);
    const compiled = useMemo(
        () =>
            found && found.source === resolved.compiled
                ? { ...found.source, solution: found.solution }
                : resolved.compiled,
        [found, resolved.compiled],
    );
    const [copied, setCopied] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [jsonView, setJsonView] = useState<JsonView>("off");
    const source = definition?.metadata.source ? parseSourceUrl(definition.metadata.source) : undefined;
    const byline = definition?.metadata.author
        ? `by ${definition.metadata.author}`
        : source
          ? `from ${sourceHost(source.href)}`
          : undefined;
    const askToLeave = useCallback(() => setLeaving(true), []);
    usePageHeader(
        definition?.metadata.title,
        definition?.metadata.description,
        byline,
        source ? askToLeave : undefined,
    );
    const actionsSlot = usePageActionsSlot();

    // Focus the board, so the keys work at once (digits, arrows) without a click first.
    // The Author page also shows a player, but there the user is busy in other fields, so only Play does this.
    const hasBoard = Boolean(compiled);
    useEffect(() => {
        if (hasBoard) document.querySelector<SVGElement>(".play .board")?.focus({ preventScroll: true });
    }, [hasBoard, ref]);

    // A one-time hint on the first puzzle that this device opens.
    const hintSeen = settings.playHintSeen;
    useEffect(() => {
        if (!hasBoard || hintSeen) return;
        toast("Click a cell, then press a digit. Shortcuts are in the sidebar.", {
            key: "play-hint",
            duration: 12000,
        });
        setSetting("playHintSeen", true);
    }, [hasBoard, hintSeen, setSetting]);

    const share = async () => {
        if (!definition) return;
        const url = `${window.location.origin}/p/${encodePuzzle(definition)}`;
        await copyText(url, () => toast("Link copied", { kind: "success", key: "share" }));
    };

    if (error && !compiled) {
        return (
            <div className="error-page" role="alert">
                <h1>This puzzle could not be opened</h1>
                <p className="error-page-message">
                    The link may be cut off or damaged, or a newer version of the app may have made the puzzle. Check
                    the link, or ask the person who sent it for a new one.
                </p>
                <details className="error-page-details">
                    <summary>Details</summary>
                    <p>{error}</p>
                </details>
                <div className="error-page-actions">
                    <Link to="/puzzles" className="btn btn-primary">
                        Browse puzzles
                    </Link>
                    <Link to="/" className="btn">
                        Home
                    </Link>
                </div>
            </div>
        );
    }

    if (!compiled || !definition) return null;

    const jsonText = jsonView === "compiled" ? JSON.stringify(compiled, null, 2) : JSON.stringify(definition, null, 2);

    // Nothing here is part of solving, so the header has one menu, not two buttons.
    const actions = (
        <OverflowMenu
            label="Puzzle actions"
            items={[
                { label: "Share link", icon: <Share2 size={16} />, onSelect: () => void share() },
                ...(source
                    ? [
                          {
                              label: `Original puzzle (${sourceHost(source.href)})`,
                              icon: <ExternalLink size={16} />,
                              onSelect: askToLeave,
                          },
                      ]
                    : []),
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

            {leaving && source && (
                <ConfirmDialog
                    title="Be careful with this link"
                    confirmLabel="Open link"
                    cancelLabel="Cancel"
                    onCancel={() => setLeaving(false)}
                    onConfirm={() => {
                        window.open(source.href, "_blank", "noopener,noreferrer");
                        setLeaving(false);
                    }}
                >
                    <p>This opens another website. We have not checked it, so only continue if you trust it.</p>
                    <code>{source.href}</code>
                </ConfirmDialog>
            )}

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
                                    Compiled (primitives that the runtime reads)
                                </button>
                            </div>
                            <div className="pj-bar-right">
                                <button
                                    className="btn btn-sm"
                                    onClick={() => void copyText(jsonText, setCopied)}
                                    title="Copy JSON"
                                >
                                    <Copy size={14} /> {copied ? "Copied" : "Copy"}
                                </button>
                                <button
                                    className="btn btn-sm"
                                    onClick={() => setJsonView("off")}
                                    title="Close"
                                    aria-label="Close"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                        <p className="pj-note">
                            {jsonView === "artifact"
                                ? "The serializable puzzle definition. A URL, file, or database row holds this."
                                : "After compile, the runtime expands definition references and resolves selectors. Each constraint is a primitive expression with a tag for its source."}
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
