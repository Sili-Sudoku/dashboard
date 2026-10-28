import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { PartyPopper, ShieldAlert } from "lucide-react";

import type { CompiledPuzzle } from "@/runtime/puzzle.ts";
import type { CellId } from "@/runtime/geometry.ts";
import Board from "@/renderer/Board.tsx";
import { buildScene } from "@/renderer/scene.ts";

import { usePuzzleSession } from "@/player/use_puzzle_session.ts";
import NumberPad from "@/player/components/number-pad";
import Controls from "@/player/components/controls";
import ConstraintPanel from "@/player/components/constraint-panel";
import HotkeyLegend from "@/player/components/hotkey-legend";

import "./player.css";

interface Props {
    puzzle: CompiledPuzzle;
}

export default function PuzzlePlayer({ puzzle }: Props) {
    const session = usePuzzleSession(puzzle);
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
                puzzle,
                valueOf: (c) => session.displayState(c).value,
                notesOf: (c) => session.displayState(c).notes,
                centerNotesOf: (c) => session.displayState(c).centerNotes,
                flaggedCells: session.getFlaggedCells(),
                isGiven: (c) => session.isGiven(c),
                selection: session.getSelection(),
                cursor: session.getCursor(),
                evaluation: session.evaluation,
                hiddenCells: session.getHiddenCells(),
            }),
        // session.revision drives re-renders via useSyncExternalStore in the hook
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [puzzle, session, session.revision],
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
                    onPaintEnd={() => undefined}
                    onClearSelection={() => session.selectNone()}
                />
                <p className="pp-hint">Click / drag to select · digits to enter · see keyboard shortcuts below</p>
            </div>

            <aside className="pp-side">
                {evaluation.complete && (
                    <div className="pp-complete">
                        <PartyPopper size={18} /> Solved!
                    </div>
                )}

                <NumberPad
                    values={puzzle.domain}
                    mode={session.inputMode}
                    onInput={(v) => session.input(v)}
                    onErase={() => session.erase()}
                    onModeChange={(m) => session.setInputMode(m)}
                />

                <Controls
                    canUndo={session.canUndo}
                    canRedo={session.canRedo}
                    onUndo={() => session.undo()}
                    onRedo={() => session.redo()}
                    onReset={() => session.reset()}
                />

                {puzzle.solution && (
                    <button
                        className={`pp-toggle ${session.checkNotesOnLeave ? "active" : ""}`}
                        aria-pressed={session.checkNotesOnLeave}
                        onClick={() => session.setCheckNotesOnLeave(!session.checkNotesOnLeave)}
                        title="When you move off a cell, flag it in red if its remaining notes no longer include the correct digit"
                    >
                        <ShieldAlert size={15} /> Check notes on leave
                    </button>
                )}

                <ConstraintPanel evaluation={evaluation} />

                <HotkeyLegend />
            </aside>
        </div>
    );
}
