import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { PartyPopper, Timer } from "lucide-react";

import type { CompiledPuzzle, VisualObject } from "@/runtime/puzzle.ts";
import type { CellId } from "@/runtime/geometry.ts";
import Board from "@/renderer/Board.tsx";
import { buildScene } from "@/renderer/scene.ts";

import { usePuzzleSession, type ExternalHistory } from "@/player/use_puzzle_session.ts";
import NumberPad from "@/player/components/number-pad";
import Controls from "@/player/components/controls";
import ConstraintPanel from "@/player/components/constraint-panel";
import HotkeyLegend from "@/player/components/hotkey-legend";

import "./player.css";

/** mm:ss, growing to h:mm:ss past an hour — plenty for a casual solve timer. */
const formatElapsed = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
    const ss = String(seconds).padStart(2, "0");
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};

interface Props {
    puzzle: CompiledPuzzle;
    /** Reports the board's own selection on every change (same Set the normal
     *  click/drag/shift-click digit-entry flow already maintains) — lets a
     *  caller like the Author page's visual builder (#54) read "what's
     *  currently selected" without needing a second, separate board just for
     *  picking cells. Selection/typing behavior itself is unaffected either
     *  way; this is a read-only mirror. */
    onSelectionChange?: (selection: ReadonlySet<CellId>) => void;
    /** Fires when a click/drag gesture on the board finishes (pointer up or
     *  leave) — lets the visual builder commit a constraint the moment a
     *  drag places it, with no separate "Add" click. */
    onSelectionEnd?: () => void;
    /** Extra visual objects drawn as if they were part of the puzzle, without
     *  touching the puzzle or session — lets the visual builder (#54) show an
     *  in-progress constraint's own graphics (e.g. a thermometer's line)
     *  growing live as cells are dragged, before it's actually committed. */
    previewObjects?: readonly VisualObject[];
    /** Compiled constraint ids to draw in red instead of hiding the whole
     *  preview — e.g. the Author page's visual builder, when a constraint the
     *  author just placed conflicts with the puzzle's own declared solution
     *  (see `compile.ts`'s `solutionViolations`). Purely visual. */
    invalidConstraintIds?: ReadonlySet<string>;
    /** Shows the puzzle's own declared solution filled in instead of the
     *  player's/session's actual board state — a display override only,
     *  doesn't touch the session, so toggling it back off reveals whatever
     *  was really entered, untouched. No-op on a puzzle with no solution. */
    showSolution?: boolean;
    /** Undo/redo that continues past the board's own history — see ExternalHistory. */
    externalHistory?: ExternalHistory;
}

export default function PuzzlePlayer({
    puzzle,
    onSelectionChange,
    onSelectionEnd,
    previewObjects,
    invalidConstraintIds,
    showSolution,
    externalHistory,
}: Props) {
    const { session, check, undo, redo, canUndo, canRedo, elapsedMs, bestElapsedMs, resetTimer } = usePuzzleSession(
        puzzle,
        externalHistory,
    );

    useEffect(() => {
        onSelectionChange?.(session.getSelection());
        // session.revision (not session itself) is the actual change signal —
        // same dependency the scene recompute below relies on.
    }, [session, session.revision, onSelectionChange]);
    const rootRef = useRef<HTMLDivElement>(null);
    const boardColRef = useRef<HTMLDivElement>(null);

    // Large boards (#49 follow-up): the sidebar is pinned with position:fixed so it
    // truly never moves once the page scrolls — sticky still has to "catch up" past
    // whatever header/title sits above it first, which reads as the panel moving.
    // Fixed needs a concrete top offset, though; rather than hardcode (and get wrong
    // whenever the header/title changes height), measure where the board column
    // naturally starts and pin the sidebar there instead.
    //
    // "Where it naturally starts" means the *grid*, not the column (#77 follow-up):
    // the column's own top is the zoom toolbar's top, a row above the grid, so pinning
    // there left the sidebar's number pad sitting noticeably higher than the puzzle.
    // .board-viewport is the grid itself — falls back to the column's top if, for
    // whatever reason, it isn't in the DOM yet.
    useLayoutEffect(() => {
        const root = rootRef.current;
        const boardCol = boardColRef.current;
        if (!root || !boardCol) return;
        const sync = () => {
            const top = boardCol.querySelector(".board-viewport")?.getBoundingClientRect().top
                ?? boardCol.getBoundingClientRect().top;
            root.style.setProperty("--pp-side-top", `${top}px`);
        };
        sync();
        window.addEventListener("resize", sync);
        return () => window.removeEventListener("resize", sync);
    }, []);

    const scene = useMemo(
        () =>
            buildScene({
                puzzle: previewObjects?.length ? { ...puzzle, objects: [...puzzle.objects, ...previewObjects] } : puzzle,
                valueOf: (c) =>
                    showSolution && puzzle.solution?.[c] !== undefined ? puzzle.solution[c] : session.displayState(c).value,
                notesOf: (c) => session.displayState(c).notes,
                centerNotesOf: (c) => session.displayState(c).centerNotes,
                flaggedCells: session.getFlaggedCells(),
                incorrectCells: session.getIncorrectCells(),
                isGiven: (c) => session.isGiven(c),
                selection: session.getSelection(),
                cursor: session.getCursor(),
                evaluation: session.evaluation,
                hiddenCells: session.getHiddenCells(),
                invalidConstraintIds,
            }),
        // session.revision drives re-renders via useSyncExternalStore in the hook
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [puzzle, session, session.revision, previewObjects, invalidConstraintIds, showSolution],
    );

    const onPaintStart = useCallback(
        (cell: CellId, add: boolean) => {
            session.select(cell, add ? "toggle" : "replace");
        },
        [session],
    );

    const onPaintMove = useCallback(
        (cell: CellId) => {
            session.select(cell, "add");
        },
        [session],
    );

    const evaluation = session.evaluation;

    return (
        <div className="puzzle-player" ref={rootRef}>
            <div className="pp-board-col" ref={boardColRef}>
                <Board
                    scene={scene}
                    onPaintStart={onPaintStart}
                    onPaintMove={onPaintMove}
                    onPaintEnd={() => onSelectionEnd?.()}
                    onClearSelection={() => session.selectNone()}
                />
                <p className="pp-hint">Click / drag to select · digits to enter · see keyboard shortcuts below</p>
            </div>

            <aside className="pp-side">
                <div className="pp-timer">
                    <Timer size={15} />
                    {formatElapsed(elapsedMs)}
                    {bestElapsedMs !== undefined && (
                        <span className="pp-timer-best">best {formatElapsed(bestElapsedMs)}</span>
                    )}
                </div>

                {evaluation.complete && (
                    <div className="pp-complete">
                        <PartyPopper size={18} /> Solved!
                    </div>
                )}

                <section className="pp-group pp-solve" aria-label="Solving controls">
                    <NumberPad
                        values={puzzle.domain}
                        mode={session.inputMode}
                        onInput={(v) => session.input(v)}
                        onErase={() => session.erase()}
                        onModeChange={(m) => session.setInputMode(m)}
                    />

                    <Controls
                        canUndo={canUndo}
                        canRedo={canRedo}
                        onUndo={undo}
                        onRedo={redo}
                        onReset={() => {
                            session.reset();
                            resetTimer();
                        }}
                        onCheck={puzzle.solution ? check : undefined}
                    />
                </section>

                <section className="pp-group pp-reference" aria-label="Reference">
                    <ConstraintPanel evaluation={evaluation} />
                    <HotkeyLegend />
                </section>
            </aside>
        </div>
    );
}
