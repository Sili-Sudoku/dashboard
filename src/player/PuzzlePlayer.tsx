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
import { createGeometry } from "@/runtime/geometry.ts";

import { describeCell, describeRegion, type ReadKind } from "@/player/describe_cell.ts";
import { usePuzzleSession, type ExternalHistory } from "@/player/use_puzzle_session.ts";
import NumberPad from "@/player/components/number-pad";
import Controls from "@/player/components/controls";
import ConstraintPanel from "@/player/components/constraint-panel";
import HotkeyLegend from "@/player/components/hotkey-legend";

import "./player.css";

/** Sidebar geometry shared with player.css (.pp-side width/right edge) plus the gap kept beside the grid. */
const SIDE_WIDTH = 340;
const SIDE_EDGE = 19;
const SIDE_GAP = 28;
/** At or below this the sidebar stacks under the board (player.css) — and the timer and zoom move into the pad's menu. */
const STACKED_QUERY = "(max-width: 820px)";

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
    /** Keep the board's own footer (timer + zoom button) on the stacked/phone layout, where it is
     *  normally folded into the controls menu — for a caller that hides the sidebar holding that menu. */
    keepFooter?: boolean;
    /** A row above the grid, sharing its left edge (e.g. the Author page's Edit / Test bar). */
    header?: ReactNode;
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

    useEffect(() => {
        onSelectionChange?.(session.getSelection());
        // session.revision (not session itself) is the actual change signal —
        // same dependency the scene recompute below relies on.
    }, [session, session.revision, onSelectionChange]);
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
        const viewport = boardCol.querySelector(".board-viewport");
        const sync = () => {
            const rect = (viewport ?? boardCol).getBoundingClientRect();
            root.style.setProperty("--pp-side-top", `${rect.top}px`);
            // Sit the sidebar a fixed gap off the grid's right edge instead of pinned to the
            // window's edge, so the two read as one unit however wide the window is. Never
            // further right than the window edge allows (the stacked layout ignores it).
            const left = Math.min(rect.right + SIDE_GAP, window.innerWidth - SIDE_WIDTH - SIDE_EDGE);
            root.style.setProperty("--pp-side-left", `${left}px`);
        };
        sync();
        window.addEventListener("resize", sync);
        // The grid is resized by Board's own fit after this first measure.
        const observer = viewport && typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : undefined;
        if (viewport) observer?.observe(viewport);
        return () => {
            window.removeEventListener("resize", sync);
            observer?.disconnect();
        };
    }, []);

    const [settings] = useSettings();
    // Stacked (phone/tablet) layouts have no room for a row under the grid: the timer and
    // the zoom controls live in the pad's "⋯" menu instead (pinch still zooms directly).
    const stacked = useMediaQuery(STACKED_QUERY);
    const [zoom, setZoom] = useState<ZoomControls | null>(null);
    const scene = useMemo(
        () =>
            buildScene({
                puzzle: previewObjects?.length
                    ? { ...puzzle, objects: [...puzzle.objects, ...previewObjects] }
                    : puzzle,
                valueOf: (c) =>
                    showSolution && puzzle.solution?.[c] !== undefined
                        ? puzzle.solution[c]
                        : session.displayState(c).value,
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
                highlightSameValue: settings.highlightSameValue,
                colorsOf: (c) => session.displayState(c).colors,
                markPalette: settings.markColors,
                pen: session.getPen(),
            }),
        // session.revision drives re-renders via useSyncExternalStore in the hook
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
        ? describeCell(cursorCell) + (selectedCount > 1 ? ` — ${selectedCount} cells selected` : "")
        : "";

    // R / C / B / G read the cursor's row / column / box / the whole board's givens aloud
    // (screen-reader overview; there is no per-cell DOM to browse). Alternating a zero-width
    // suffix makes pressing the same key twice re-announce.
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
                      (s) => s.startsWith(`${kind}:`) && geometry.resolveRegion(s)?.includes(cursor),
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
        <div className="puzzle-player" ref={rootRef}>
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
                            <p className="pp-hint" id={hintId}>
                                Click / drag to select · digits to enter · see keyboard shortcuts below
                            </p>
                        </>
                    }
                />
            </div>

            <aside className="pp-side">
                {/* The board is an SVG without per-cell DOM, so this is how a screen
                    reader learns where the cursor is and what's in the cell. */}
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
                    <ConstraintPanel evaluation={evaluation} selection={session.getSelection()} />
                    <HotkeyLegend />
                </section>
            </aside>
        </div>
    );
}
