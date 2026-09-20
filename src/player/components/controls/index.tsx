import { RotateCcw, Undo2, Redo2 } from "lucide-react";

import "./style.css";

interface Props {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onReset: () => void;
}

export default function Controls({ canUndo, canRedo, onUndo, onRedo, onReset }: Props) {
    return (
        <div className="controls">
            <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
                <Undo2 size={16} /> Undo
            </button>
            <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
                <Redo2 size={16} /> Redo
            </button>
            <button onClick={onReset} title="Clear all entered values">
                <RotateCcw size={16} /> Reset
            </button>
        </div>
    );
}
