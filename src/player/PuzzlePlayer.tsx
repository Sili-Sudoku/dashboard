import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Maximize, PartyPopper, Scan, Timer, ZoomIn, ZoomOut, Lock, Unlock } from "lucide-react";

import type { CompiledPuzzle, VisualObject } from "@/runtime/puzzle.ts";
import { useSettings } from "@/app/use_settings.ts";
import type { CellId } from "@/runtime/geometry.ts";
import Board, { type ZoomControls } from "@/renderer/Board.tsx";
import type { MenuItem } from "@/app/overflow_menu.tsx";
import { useMediaQuery } from "@/app/use_media_query.ts";
import { buildScene } from "@/renderer/scene.ts";
import { createGeometry, regionKind } from "@/runtime/geometry.ts";

import { describeCell, describeRegion, type ReadKind } from "@/player/describe_cell.ts";
import { usePuzzleSession, type ExternalHistory } from "@/player/use_puzzle_session.ts";
import NumberPad from "@/player/components/number-pad";
import Controls from "@/player/components/controls";
import ConstraintPanel from "@/player/components/constraint-panel";
import HotkeyLegend from "@/player/components/hotkey-legend";
import SolvedCelebration from "@/player/components/solved-celebration";

import "./player.css";

/** Sidebar geometry shared with player.css (.pp-side width and right edge), and the gap beside the grid. */
const SIDE_WIDTH = 340;
const SIDE_EDGE = 19;
const SIDE_GAP = 28;
/** At or below this width, the sidebar stacks under the board (player.css).
 *  The timer and the zoom controls then move into the menu of the pad. */
const STACKED_QUERY = "(max-width: 820px)";

/** mm:ss, then h:mm:ss after one hour. This is enough for a casual solve timer. */
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
    /** Reports the selection of the board on each change.
     *  It is the same Set that the click, drag and shift-click digit-entry flow maintains.
     *  A caller, such as the visual builder of the Author page, can read the selected cells
     *  without a second board only to pick cells.
     *  Selection and typing behavior are not affected. This is a read-only mirror. */
    onSelectionChange?: (selection: ReadonlySet<CellId>) => void;
    /** Fires when a click or drag gesture on the board ends (pointer up or leave).
     *  The visual builder uses it to commit a constraint when a drag places it, with no separate "Add" click. */
    onSelectionEnd?: () => void;
    /** Extra visual objects that the board draws as part of the puzzle, without a change to the puzzle or session.
     *  The visual builder uses them to show the graphics of a constraint that is in progress
     *  (for example the line of a thermometer) while cells are dragged, before the constraint is committed. */
    previewObjects?: readonly VisualObject[];
    /** Compiled constraint ids to draw in red, instead of a hidden preview.
     *  Example: the visual builder of the Author page, when a placed constraint conflicts with
     *  the declared solution of the puzzle (see `solutionViolations` in `compile.ts`). Visual only. */
    invalidConstraintIds?: ReadonlySet<string>;
    /** Shows the declared solution of the puzzle, filled in, instead of the board state of the player or session.
     *  It is a display override only. It does not change the session, so when it is off again,
     *  the cells show what was really entered. It does nothing for a puzzle with no solution. */
    showSolution?: boolean;
    /** Keep the footer of the board (timer and zoom button) in the stacked or phone layout.
     *  Normally the controls menu holds them there. Use it for a caller that hides the sidebar with that menu. */
    keepFooter?: boolean;
    /** A row above the grid, with the same left edge (for example the Edit / Test bar of the Author page). */
    header?: ReactNode;
    /** Undo and redo that go past the history of the board (see ExternalHistory). */
    externalHistory?: ExternalHistory;
}

export default function PuzzlePlayer({
    puzzle,
    onSelectionChange,
    onSelectionEnd,
    previewObjects,
    invalidConstraintIds,
    showSolution,
    keepFooter,
    header,
    externalHistory,
}: Props) {
    const rootRef = useRef<HTMLDivElement>(null);
    const { session, check, undo, redo, canUndo, canRedo, elapsedMs, bestElapsedMs, resetTimer } = usePuzzleSession(
        puzzle,
        rootRef,
        externalHistory,
    );

    // The celebration opens when the puzzle *becomes* solved during this visit. A puzzle that was already solved
    // when the page loaded gets the quiet "Solved!" strip only.
    const [wasComplete, setWasComplete] = useState(session.evaluation.complete);
    const [celebrating, setCelebrating] = useState(false);
    if (session.evaluation.complete !== wasComplete) {
        setWasComplete(session.evaluation.complete);
        setCelebrating(session.evaluation.complete);
    }

    useEffect(() => {
        onSelectionChange?.(session.getSelection());
        // session.revision (not session itself) is the real change signal.
        // The scene recompute below uses the same dependency.
    }, [session, session.revision, onSelectionChange]);
    const boardColRef = useRef<HTMLDivElement>(null);

    // Large boards: the sidebar is position:fixed, so it never moves when the page scrolls.
    // (A sticky sidebar first has to catch up past the header and title, and that looks like the panel moves.)
    // Fixed needs a concrete top offset, and a hardcoded one breaks when the header or title height changes.
    // So measure where the board starts and pin the sidebar there.
    // "Where it starts" is the *grid* (.board-viewport), not the column: the column starts one row higher,
    // at the zoom toolbar, and a pin there put the number pad above the puzzle.
    // If the grid is not in the DOM yet, use the top of the column.
    useLayoutEffect(() => {
        const root = rootRef.current;
        const boardCol = boardColRef.current;
        if (!root || !boardCol) return;
        const viewport = boardCol.querySelector(".board-viewport");
        const sync = () => {
            const rect = (viewport ?? boardCol).getBoundingClientRect();
            root.style.setProperty("--pp-side-top", `${rect.top}px`);
            // The distance from the grid bottom to the window bottom: the docked panel ends level with the grid.
            root.style.setProperty("--pp-side-bottom", `${Math.max(0, window.innerHeight - rect.bottom)}px`);
            // Put the sidebar a fixed gap from the right edge of the grid, not at the edge of the window.
            // So the two look like one unit at any window width.
            // Never go further right than the window edge allows (the stacked layout ignores it).
            const left = Math.min(rect.right + SIDE_GAP, window.innerWidth - SIDE_WIDTH - SIDE_EDGE);
            root.style.setProperty("--pp-side-left", `${left}px`);
        };
        sync();
        window.addEventListener("resize", sync);
        // The fit of Board resizes the grid after this first measure.
        const observer = viewport && typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : undefined;
        if (viewport) observer?.observe(viewport);
        return () => {
            window.removeEventListener("resize", sync);
            observer?.disconnect();
        };
    }, []);

    const [settings] = useSettings();
    // Stacked (phone, tablet) layouts have no room for a row under the grid.
    // The timer and the zoom controls are in the "⋯" menu of the pad instead (pinch still zooms directly).
    const stacked = useMediaQuery(STACKED_QUERY);
    const [zoom, setZoom] = useState<ZoomControls | null>(null);
    const scene = useMemo(
        () =>
            buildScene({
                puzzle: (() => {
                    // Dynamic rules can show or hide objects when the board changes.
                    const objects = session.getVisibleObjects();
                    return previewObjects?.length
                        ? { ...puzzle, objects: [...objects, ...previewObjects] }
                        : objects === puzzle.objects
                          ? puzzle
                          : { ...puzzle, objects };
                })(),
                valueOf: (c) =>
                    showSolution && puzzle.solution?.[c] !== undefined
                        ? puzzle.solution[c]
                        : session.displayState(c).value,
                notesOf: (c) => session.displayState(c).notes,
                centerNotesOf: (c) => session.displayState(c).centerNotes,
                flaggedCells: session.getFlaggedCells(),
                ruledOutNotes: session.getRuledOutNotes(),
                incorrectCells: session.getIncorrectCells(),
                isGiven: (c) => session.isGiven(c),
                selection: session.getSelection(),
                cursor: session.getCursor(),
                evaluation: session.evaluation,
                hiddenCells: session.getHiddenCells(),
                absentCells: session.getAbsentCells(),
                invalidConstraintIds,
                highlightSameValue: settings.highlightSameValue && session.isMatchHighlighted(),
                colorsOf: (c) => session.displayState(c).colors,
                markPalette: settings.markColors,
                pen: session.getPen(),
            }),
        // session.revision drives re-renders through useSyncExternalStore in the hook
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            puzzle,
            session,
            session.revision,
            previewObjects,
            invalidConstraintIds,
            showSolution,
            settings.highlightSameValue,
            settings.markColors,
        ],
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

    const hintId = useId();
    const cursorCell = scene.cells.find((c) => c.ring === "cursor");
    const selectedCount = scene.cells.filter((c) => c.ring !== null).length;
    const cursorAnnouncement = cursorCell
        ? describeCell(cursorCell) + (selectedCount > 1 ? `. ${selectedCount} cells selected` : "")
        : "";

    // R, C, B and G read aloud the row, column and box of the cursor, and the givens of the whole board.
    // This is the screen-reader overview (there is no per-cell DOM to browse).
    // An alternating zero-width suffix makes the same key pressed twice announce again.
    const [readout, setReadout] = useState("");
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const geometry = createGeometry(puzzle.geometry);
        const kinds: Record<string, ReadKind> = { r: "row", c: "col", b: "box", g: "givens" };
        const onKeyDown = (e: KeyboardEvent) => {
            const kind = kinds[e.key.toLowerCase()];
            const target = e.target as HTMLElement | null;
            if (!kind || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))
                return;
            const cursor = scene.cells.find((c) => c.ring === "cursor")?.cell;
            const selector = cursor
                ? geometry.regionSelectors.find(
                      (s) => regionKind(s) === kind && geometry.resolveRegion(s)?.includes(cursor),
                  )
                : undefined;
            const region = selector ? { selector, cells: geometry.resolveRegion(selector) ?? [] } : undefined;
            const text = describeRegion(kind, scene.cells, region);
            setReadout((prev) => (prev === text ? `${text}\u200b` : text));
        };
        root.addEventListener("keydown", onKeyDown);
        return () => root.removeEventListener("keydown", onKeyDown);
    }, [puzzle.geometry, scene.cells]);

    const stackedMenuItems: MenuItem[] = stacked
        ? [
              {
                  label: `${formatElapsed(elapsedMs)}${bestElapsedMs !== undefined ? ` · best ${formatElapsed(bestElapsedMs)}` : ""}`,
                  icon: <Timer size={16} />,
                  info: true,
                  onSelect: () => undefined,
              },
              ...(zoom
                  ? [
                        { label: "Zoom in", icon: <ZoomIn size={16} />, onSelect: zoom.zoomIn },
                        { label: "Zoom out", icon: <ZoomOut size={16} />, onSelect: zoom.zoomOut },
                        { label: "Fit to screen", icon: <Maximize size={16} />, onSelect: zoom.fit },
                        { label: "Actual size", icon: <Scan size={16} />, onSelect: zoom.actualSize },
                        {
                            label: zoom.locked ? "Unlock zoom" : "Lock zoom",
                            icon: zoom.locked ? <Unlock size={16} /> : <Lock size={16} />,
                            onSelect: zoom.toggleLock,
                        },
                    ]
                  : []),
          ]
        : [];

    return (
        <div className="puzzle-player" ref={rootRef} data-dock={settings.dockControlsBottom ? "bottom" : "top"}>
            <div className="pp-board-col" ref={boardColRef}>
                <Board
                    label={`${puzzle.metadata.title}, puzzle board`}
                    describedBy={hintId}
                    scene={scene}
                    pen={
                        session.inputMode === "pen"
                            ? {
                                  segments: session.getPen().segments,
                                  onStroke: (points) => session.penStroke(points),
                                  onMark: (point) => session.penMark(point),
                              }
                            : undefined
                    }
                    onPaintStart={onPaintStart}
                    onPaintMove={onPaintMove}
                    onPaintEnd={() => onSelectionEnd?.()}
                    onCellDoubleClick={() => session.highlightMatches()}
                    onClearSelection={() => session.selectNone()}
                    hideFooter={stacked && !keepFooter}
                    header={header}
                    onZoomControls={setZoom}
                    footer={
                        <>
                            <div className="pp-timer">
                                <Timer size={15} />
                                {formatElapsed(elapsedMs)}
                                {bestElapsedMs !== undefined && (
                                    <span className="pp-timer-best">best {formatElapsed(bestElapsedMs)}</span>
                                )}
                            </div>
                            <p className="sr-only" id={hintId}>
                                Click or drag to select. Press digits to enter. See the keyboard shortcuts below.
                            </p>
                        </>
                    }
                />
                {celebrating && (
                    <SolvedCelebration
                        time={formatElapsed(elapsedMs)}
                        best={bestElapsedMs !== undefined ? formatElapsed(bestElapsedMs) : undefined}
                        newBest={bestElapsedMs !== undefined && bestElapsedMs >= elapsedMs}
                        onClose={() => setCelebrating(false)}
                    />
                )}
            </div>

            <aside className="pp-side">
                {/* The board is an SVG without per-cell DOM.
                    A screen reader learns the cursor position and the cell content from this region. */}
                <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                    {cursorAnnouncement}
                </div>
                <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
                    {readout}
                </div>
                {evaluation.complete && (
                    <div className="pp-complete" role="status">
                        <PartyPopper size={18} /> Solved!
                    </div>
                )}

                <section className="pp-group pp-solve" aria-label="Solving controls">
                    <NumberPad
                        values={puzzle.domain}
                        palette={settings.markColors}
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
                        extraItems={stackedMenuItems}
                    />
                </section>

                <section className="pp-group pp-reference" aria-label="Reference">
                    <ConstraintPanel
                        evaluation={evaluation}
                        description={puzzle.metadata.description}
                        selection={session.getSelection()}
                    />
                    <HotkeyLegend />
                </section>
            </aside>
        </div>
    );
}
