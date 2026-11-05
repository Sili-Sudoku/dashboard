import { useId, useState, type ReactNode, type Ref } from "react";
import { Lock, Maximize, Scan, Unlock, ZoomIn, ZoomOut } from "lucide-react";

import { MAX_ZOOM, MIN_ZOOM } from "@/renderer/virtualize.ts";

interface Props {
    footerRef: Ref<HTMLDivElement>;
    /** Shown left of the zoom button. The player puts its timer here. */
    children?: ReactNode;
    percent: number;
    locked: boolean;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomToPercent: (pct: number) => void;
    onFit: () => void;
    onActualSize: () => void;
    onToggleLock: () => void;
}

/** The row under the grid: caller content, the zoom button, and the zoom panel that the button opens. */
export default function ZoomFooter({
    footerRef,
    children,
    percent,
    locked,
    onZoomIn,
    onZoomOut,
    onZoomToPercent,
    onFit,
    onActualSize,
    onToggleLock,
}: Props) {
    const zoomPanelId = `cpr-zq3m-zoom-${useId().replace(/:/g, "")}`;
    const [open, setOpen] = useState(false);
    return (
        <div className="board-footer" ref={footerRef}>
            <div className="board-footer-content">{children}</div>
            <button
                type="button"
                className="btn btn-flat board-zoom-toggle"
                aria-expanded={open}
                aria-controls={zoomPanelId}
                aria-label={`${percent}% zoom controls`}
                onClick={() => setOpen((o) => !o)}
            >
                {locked ? <Lock size={16} /> : <ZoomIn size={16} />}
                <span className="board-zoom-toggle-level">{percent}%</span>
            </button>
            <div
                className="board-zoom-toolbar"
                id={zoomPanelId}
                hidden={!open}
                onKeyDown={(e) => {
                    if (e.key === "Escape" && open) {
                        e.stopPropagation();
                        setOpen(false);
                    }
                }}
            >
                <button
                    type="button"
                    className={`btn btn-sm ${locked ? "active" : ""}`}
                    onClick={onToggleLock}
                    aria-pressed={locked}
                    aria-label={locked ? "Unlock zoom (currently locked)" : "Lock zoom at its current level"}
                >
                    {locked ? <Lock size={16} /> : <Unlock size={16} />}
                </button>
                <button
                    type="button"
                    className="btn btn-sm"
                    onClick={onZoomOut}
                    aria-label="Zoom out"
                    disabled={locked}
                >
                    <ZoomOut size={16} />
                </button>
                <input
                    type="range"
                    className="board-zoom-slider"
                    min={Math.round(MIN_ZOOM * 100)}
                    max={Math.round(MAX_ZOOM * 100)}
                    step={1}
                    value={percent}
                    onChange={(e) => onZoomToPercent(Number(e.target.value))}
                    aria-label="Zoom level"
                    disabled={locked}
                />
                <span className="board-zoom-level">{percent}%</span>
                <button type="button" className="btn btn-sm" onClick={onZoomIn} aria-label="Zoom in" disabled={locked}>
                    <ZoomIn size={16} />
                </button>
                <button
                    type="button"
                    className="btn btn-sm"
                    onClick={onFit}
                    aria-label="Fit whole board to screen"
                    disabled={locked}
                >
                    <Maximize size={16} /> <span className="board-zoom-btn-label">Fit</span>
                </button>
                <button
                    type="button"
                    className="btn btn-sm"
                    onClick={onActualSize}
                    aria-label="Reset to actual size (1 board unit per pixel)"
                    disabled={locked}
                >
                    <Scan size={16} /> <span className="board-zoom-btn-label">Actual size</span>
                </button>
            </div>
        </div>
    );
}
