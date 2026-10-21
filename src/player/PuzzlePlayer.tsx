import { useCallback, useMemo, useState } from "react";
import { ListChecks, PartyPopper } from "lucide-react";

import type { CompiledPuzzle } from "@/runtime/puzzle.ts";
import type { CellId } from "@/runtime/geometry.ts";
import Board from "@/renderer/Board.tsx";
import { buildScene } from "@/renderer/scene.ts";

import { usePuzzleSession } from "@/player/use_puzzle_session.ts";
import NumberPad from "@/player/components/number-pad";
import Controls from "@/player/components/controls";
import ConstraintPanel from "@/player/components/constraint-panel";

import "./player.css";

interface Props {
    puzzle: CompiledPuzzle;
}

export default function PuzzlePlayer({ puzzle }: Props) {
    const session = usePuzzleSession(puzzle);
    const [showConstraints, setShowConstraints] = useState(false);

    const scene = useMemo(
        () =>
            buildScene({
                puzzle,
                valueOf: session.valueOf,
                notesOf: (c) => session.cellState(c).notes,
                isGiven: (c) => session.isGiven(c),
                selection: session.getSelection(),
                cursor: session.getCursor(),
                evaluation: session.evaluation,
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
        <div className="puzzle-player">
            <div className="pp-board-col">
                <Board
                    scene={scene}
                    onPaintStart={onPaintStart}
                    onPaintMove={onPaintMove}
                    onPaintEnd={() => undefined}
                    onClearSelection={() => session.selectNone()}
                />
                <p className="pp-hint">
                    Click / drag to select · digits to enter · <kbd>Space</kbd> notes · arrows to move ·{" "}
                    <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo
                </p>
            </div>

            <aside className="pp-side">
                {evaluation.complete && (
                    <div className="pp-complete">
                        <PartyPopper size={18} /> Solved!
                    </div>
                )}

                <NumberPad
                    values={puzzle.domain}
                    noteMode={session.noteMode}
                    onInput={(v) => session.input(v)}
                    onErase={() => session.erase()}
                    onToggleNotes={() => session.setNoteMode(!session.noteMode)}
                />

                <Controls
                    canUndo={session.canUndo}
                    canRedo={session.canRedo}
                    onUndo={() => session.undo()}
                    onRedo={() => session.redo()}
                    onReset={() => session.reset()}
                />

                <button
                    className="pp-constraints-toggle"
                    aria-expanded={showConstraints}
                    onClick={() => setShowConstraints((v) => !v)}
                >
                    <ListChecks size={15} /> {showConstraints ? "Hide constraints" : "Show constraints"}
                </button>
                {showConstraints && <ConstraintPanel evaluation={evaluation} />}
            </aside>
        </div>
    );
}
