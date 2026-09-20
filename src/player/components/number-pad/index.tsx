import { Eraser, Pencil } from "lucide-react";

import "./style.css";

interface Props {
    values: readonly number[];
    noteMode: boolean;
    onInput: (value: number) => void;
    onErase: () => void;
    onToggleNotes: () => void;
}

export default function NumberPad({ values, noteMode, onInput, onErase, onToggleNotes }: Props) {
    return (
        <div className="number-pad">
            <div className="pad-grid" style={{ gridTemplateColumns: `repeat(${padColumns(values.length)}, 1fr)` }}>
                {values.map((v) => (
                    <button key={v} className="pad-key" onClick={() => onInput(v)}>
                        {v}
                    </button>
                ))}
            </div>
            <div className="pad-actions">
                <button className={`pad-key wide ${noteMode ? "active" : ""}`} onClick={onToggleNotes}>
                    <Pencil size={16} /> Notes
                </button>
                <button className="pad-key wide" onClick={onErase}>
                    <Eraser size={16} /> Erase
                </button>
            </div>
        </div>
    );
}

const padColumns = (count: number): number => (count <= 4 ? count : count <= 9 ? 3 : 5);
