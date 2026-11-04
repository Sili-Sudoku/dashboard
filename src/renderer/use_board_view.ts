import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from "react";

import { useSettings } from "@/app/use_settings.ts";
import type { Scene } from "@/renderer/scene.ts";
import { cullToViewport } from "@/renderer/board_math.ts";
import {
    clamp,
    clampView,
    fitView,
    MAX_ZOOM,
    MIN_ZOOM,
    panView,
    ZOOM_STEP,
    zoomViewAt,
    type ViewportRect,
} from "@/renderer/virtualize.ts";

// Space kept free against window.innerWidth/innerHeight when the fit is clamped.
// This keeps the box away from the edge of the browser viewport.
const EDGE_MARGIN = 16;

// Matches the `.board-wrap { gap }` in board.css. The footer row is below the grid in the same wrap.
// This gap and the height of the row come out of the height budget.
export const FOOTER_GAP = 8;

export interface ZoomControls {
    percent: number;
    locked: boolean;
    zoomIn: () => void;
    zoomOut: () => void;
    fit: () => void;
    actualSize: () => void;
    toggleLock: () => void;
}

interface Options {
    scene: Scene;
    hasHeader: boolean;
    hideFooter: boolean | undefined;
    /** Publishes the zoom actions and state each time they change (null on unmount), for a menu of the caller. */
    onZoomControls?: (controls: ZoomControls | null) => void;
    /** A second finger landed. Whatever a single finger was doing (a selection drag) must stop. */
    onSecondTouch: () => void;
}

/**
 * Everything about what part of the board is visible and how big its box is:
 * the measured box, zoom (wheel, buttons, slider, pinch), pan (middle/right drag, two fingers) and the zoom lock.
 */
export function useBoardView({ scene, hasHeader, hideFooter, onZoomControls, onSecondTouch }: Options) {
    const panningFrom = useRef<{ x: number; y: number } | null>(null);
    // Two-finger touch pan/zoom. A touchscreen has no middle or right
    // button for the desktop pan below. One finger already drives the cell-selection drag.
    // So this follows the convention of maps and photo viewers: a second finger pans and pinch-zooms.
    const activeTouches = useRef(new Map<number, { x: number; y: number }>());
    const pinchAnchor = useRef<{ x: number; y: number; dist: number } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const footerRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    // The visible rect, in board units. This *is* the viewBox of the SVG. There is no scrolling.
    // Panning and zooming only change this rect, as in the canvas of SudokuPad.
    const [view, setView] = useState<ViewportRect | null>(null);
    const [zoomPct, setZoomPct] = useState(100);
    // Freezes the scale of the view (wheel, +/-, slider, Fit, Actual size). Panning still works.
    // It helps a player who changes the zoom by accident when they pan a puzzle that has the size they want.
    // It starts from the Settings value and saves to Settings.
    const [settings, setSetting] = useSettings();
    const zoomLocked = settings.zoomLocked;
    // The on-screen size of the wrap/viewport box. It is a stable canvas.
    // The view pans and zooms *within* it. The box does not resize each time the player zooms.
    // It does track the space available in .board-measure through a ResizeObserver (below).
    // It stays unset until the first measurement runs.
    const [boxSize, setBoxSize] = useState<{ width: number; height: number } | null>(null);

    useLayoutEffect(() => {
        const el = measureRef.current;
        if (!el) return;
        let firstFit = true;

        // Not fitView() here. fitView() letterboxes the viewBox to the aspect ratio of the *measured*
        // container. That is correct when the box has a fixed external shape
        // (for example, a later manual "Fit to screen").
        // Here the shape of the box is *derived* from the scene (below).
        // So the starting view is the bounding box of the scene, with no letterbox to
        // a container aspect ratio that the box does not keep.
        const fit = () => {
            const rect = el.getBoundingClientRect();
            // The *measured* size of .board-measure was not independent of its own children, as intended.
            // A logging run confirmed it. Every resize tick reported a size bigger than the last,
            // by about the same amount, each time Board.tsx set boxSize on the elements inside it.
            // This is a feedback loop, not a one-off misread.
            // The exact mechanism is unknown. The bounds of the window are a ceiling
            // that nothing can legitimately exceed. So clamp against them and do not trust
            // the size from flex outright. This caps the loop whatever the cause.
            const width = Math.min(rect.width, window.innerWidth - rect.left - EDGE_MARGIN);
            // The window limits the height, not the space left below the top of the board.
            // On a scrolling (phone) page the board can start below the fold.
            // Then "what is left" would shrink it to a thumbnail (it measured 182px of 374).
            const height = Math.min(rect.height, window.innerHeight - EDGE_MARGIN);
            if (width <= 0 || height <= 0) return;
            // The footer row is below the grid in the same wrap (see FOOTER_GAP).
            // Its height does not depend on the board size.
            // So it is safe (not circular) to measure it and subtract it from the budget.
            const footerHeight = footerRef.current?.getBoundingClientRect().height ?? 0;
            // The header row above the grid (when given) comes out of the budget in the same way.
            const headerHeight = headerRef.current ? headerRef.current.getBoundingClientRect().height + FOOTER_GAP : 0;
            const viewportHeight = height - footerHeight - headerHeight - (hideFooter ? 0 : FOOTER_GAP);
            if (width <= 0 || viewportHeight <= 0) return;
            const scale = clamp(Math.min(width / scene.width, viewportHeight / scene.height), MIN_ZOOM, MAX_ZOOM);
            setBoxSize({ width: scene.width * scale, height: scene.height * scale });
            // Only the first fit sets the starting view and zoom. Later resizes only let
            // the existing canvas grow or shrink. They must not reset the pan and zoom of the player.
            if (!firstFit) return;
            firstFit = false;
            setView({ left: 0, top: 0, width: scene.width, height: scene.height });
            // 100% = the whole board fits in the view, always. It is not the achieved physical scale.
            // That scale changes with screen size, DPI, and cell size. It had no stable meaning to the player
            // (a baseline fit read "169%" on one window and a different value on another).
            // Every other zoom % below has the same definition: scene.width / view.width * 100.
            setZoomPct(100);
        };

        fit();
        window.addEventListener("resize", fit);

        if (typeof ResizeObserver === "undefined") {
            // Not available in every test/legacy env. The initial fit above still runs.
            return () => window.removeEventListener("resize", fit);
        }
        const observer = new ResizeObserver(fit);
        observer.observe(el);
        return () => {
            window.removeEventListener("resize", fit);
            observer.disconnect();
        };
        // Runs again only if the scene changes (a different puzzle). PuzzlePlayer
        // remounts Board for each puzzle, so in practice this runs on mount only.
    }, [scene.width, scene.height, hideFooter, hasHeader]);

    const visibleScene = useMemo(() => cullToViewport(scene, view), [scene, view]);

    const applyZoom = useCallback(
        (fracX: number, fracY: number, factor: number) => {
            if (zoomLocked) return;
            const el = containerRef.current;
            if (!el || !view) return;
            const rect = el.getBoundingClientRect();
            const next = zoomViewAt(view, scene.width, scene.height, rect.width, fracX, fracY, factor);
            setView(next);
            // scene.width / view.width, not rect.width / view.width (see the mount-fit comment above).
            // This keeps the % of every zoom action relative to "whole board visible",
            // whatever the pixel size of the container.
            setZoomPct(Math.round((scene.width / next.width) * 100));
        },
        [view, scene.width, scene.height, zoomLocked],
    );

    const zoomToPercent = (pct: number) => {
        if (!view) return;
        // Inverse of the display formula above: the view width (in board units) that
        // makes scene.width / viewWidth * 100 equal the % chosen with the slider.
        const targetWidth = (scene.width * 100) / pct;
        applyZoom(0.5, 0.5, view.width / targetWidth);
    };

    const zoomIn = () => applyZoom(0.5, 0.5, ZOOM_STEP);
    const zoomOut = () => applyZoom(0.5, 0.5, 1 / ZOOM_STEP);

    const fit = () => {
        if (zoomLocked) return;
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const next = fitView(scene.width, scene.height, rect.width, rect.height);
        setView(next);
        setZoomPct(Math.round((scene.width / next.width) * 100)); // always 100 (see above)
    };

    const actualSize = () => {
        if (zoomLocked) return;
        const el = containerRef.current;
        if (!el || !view) return;
        const rect = el.getBoundingClientRect();
        const cx = view.left + view.width / 2;
        const cy = view.top + view.height / 2;
        // "Actual size" = 1 board unit for each screen pixel, centered on the current position.
        // It is a different zoom level from "fit", and it is useful by itself.
        // So it is not literally "100%", because 100% now always means "fit".
        // The % shown below is this native scale relative to fit.
        // It uses the same formula as every other zoom action.
        const next = clampView(
            { left: cx - rect.width / 2, top: cy - rect.height / 2, width: rect.width, height: rect.height },
            scene.width,
            scene.height,
        );
        setView(next);
        setZoomPct(Math.round((scene.width / next.width) * 100));
    };

    const toggleLock = () => setSetting("zoomLocked", !zoomLocked);

    // The latest handlers sit behind a stable surface. So publishing them does not re-fire on every render.
    const zoomActions = useRef({
        zoomIn: () => {},
        zoomOut: () => {},
        fit: () => {},
        actualSize: () => {},
        toggleLock: () => {},
    });
    useEffect(() => {
        zoomActions.current = { zoomIn, zoomOut, fit, actualSize, toggleLock };
    });
    useEffect(() => {
        if (!onZoomControls) return;
        onZoomControls({
            percent: zoomPct,
            locked: zoomLocked,
            zoomIn: () => zoomActions.current.zoomIn(),
            zoomOut: () => zoomActions.current.zoomOut(),
            fit: () => zoomActions.current.fit(),
            actualSize: () => zoomActions.current.actualSize(),
            toggleLock: () => zoomActions.current.toggleLock(),
        });
        return () => onZoomControls(null);
    }, [onZoomControls, zoomPct, zoomLocked]);

    // The onWheel prop of React is attached passively at the root (for scroll performance,
    // shared with every other wheel listener on the page). So preventDefault() inside it
    // cannot stop the page from scrolling under it. Only a native listener, registered
    // explicitly as non-passive, can zoom without the page scrolling at the same time.
    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onNativeWheel = (e: WheelEvent) => {
            // Locked: let the wheel event do its normal action (scroll the page).
            // Do not take it for a zoom that does nothing.
            if (zoomLocked) return;
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const fracX = (e.clientX - rect.left) / rect.width;
            const fracY = (e.clientY - rect.top) / rect.height;
            const factor = Math.pow(ZOOM_STEP, -e.deltaY / 100);
            applyZoom(fracX, fracY, factor);
        };

        el.addEventListener("wheel", onNativeWheel, { passive: false });
        return () => el.removeEventListener("wheel", onNativeWheel);
    }, [applyZoom, zoomLocked]);

    // Panning: drag with the middle or right button. So it never competes with
    // the left-button cell-selection drag.
    const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 1 && e.button !== 2) return;
        e.preventDefault();
        panningFrom.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!panningFrom.current || !view) return;
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const dx = ((e.clientX - panningFrom.current.x) / rect.width) * view.width;
        const dy = ((e.clientY - panningFrom.current.y) / rect.height) * view.height;
        panningFrom.current = { x: e.clientX, y: e.clientY };
        setView((v) => (v ? panView(v, scene.width, scene.height, -dx, -dy) : v));
    };

    const stopPanning = () => {
        panningFrom.current = null;
    };

    // Tracked at the container level (not for each cell), because the second finger usually
    // lands on a cell. These *Capture handlers run in the capture phase, before the own
    // onPointerDown of that cell (bubble phase).
    // So stopPropagation() here stops a second finger from starting or extending a cell-selection drag.
    const handleTouchDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.pointerType !== "touch") return;
        activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.current.size === 2) {
            e.stopPropagation();
            onSecondTouch();
            pinchAnchor.current = null;
        }
    };

    const handleTouchMoveCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!activeTouches.current.has(e.pointerId)) return;
        activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.current.size < 2) return;
        e.stopPropagation();
        const el = containerRef.current;
        const anchor = pinchAnchor.current;
        const [a, b] = [...activeTouches.current.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (!el || !anchor) {
            pinchAnchor.current = { x: mid.x, y: mid.y, dist };
            return;
        }
        const rect = el.getBoundingClientRect();
        const factor = zoomLocked || anchor.dist === 0 ? 1 : dist / anchor.dist;
        const fracX = (mid.x - rect.left) / rect.width;
        const fracY = (mid.y - rect.top) / rect.height;
        // Reads the *pending* view through the updater form, not the `view` closed over at render time.
        // The pointermove events of two fingers often land in the same synchronous burst (no render between).
        // A second setView in that burst would compute from the same stale `view` and silently overwrite the first.
        setView((v) => {
            if (!v) return v;
            const dx = ((mid.x - anchor.x) / rect.width) * v.width;
            const dy = ((mid.y - anchor.y) / rect.height) * v.height;
            const panned = panView(v, scene.width, scene.height, -dx, -dy);
            const next =
                factor === 1 ? panned : zoomViewAt(panned, scene.width, scene.height, rect.width, fracX, fracY, factor);
            setZoomPct(Math.round((scene.width / next.width) * 100));
            return next;
        });
        pinchAnchor.current = { x: mid.x, y: mid.y, dist };
    };

    const handleTouchUpCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.pointerType !== "touch") return;
        activeTouches.current.delete(e.pointerId);
        if (activeTouches.current.size < 2) pinchAnchor.current = null;
    };

    return {
        containerRef,
        measureRef,
        footerRef,
        headerRef,
        view,
        visibleScene,
        boxSize,
        zoomPct,
        zoomLocked,
        zoom: { zoomIn, zoomOut, zoomToPercent, fit, actualSize, toggleLock },
        viewportHandlers: {
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: stopPanning,
            onPointerLeave: stopPanning,
            onPointerDownCapture: handleTouchDownCapture,
            onPointerMoveCapture: handleTouchMoveCapture,
            onPointerUpCapture: handleTouchUpCapture,
            onPointerCancelCapture: handleTouchUpCapture,
        },
    };
}
