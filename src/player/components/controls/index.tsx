import { RotateCcw, Undo2, Redo2, BadgeCheck } from "lucide-react";

import "./style.css";

interface Props {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onReset: () => void;
    /** Omitted entirely when the puzzle has no declared solution to check against (#52). */
    onCheck?: () => void;
}

export default function Controls({ canUndo, canRedo, onUndo, onRedo, onReset, onCheck }: Props) {
    return (
        <div className="controls">
            <div className="controls-row">
                <button className="btn" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
                    <Undo2 size={16} /> Undo
                </button>
                <button className="btn" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
                    <Redo2 size={16} /> Redo
                </button>
                <button className="btn" onClick={onReset} title="Clear all entered values">
                    <RotateCcw size={16} /> Reset
                </button>
            </div>
            {onCheck && (
                <button
                    className="btn"
                    onClick={onCheck}
                    title="Check against the solution (V) — a second press (with no edits in between) reveals exactly what's wrong"
                >
                    <BadgeCheck size={16} /> Check
                </button>
            )}
        </div>
    );
}
