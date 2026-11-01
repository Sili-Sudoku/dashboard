import { RotateCcw, Undo2, Redo2, BadgeCheck } from "lucide-react";

import { OverflowMenu, type MenuItem } from "@/app/overflow_menu.tsx";

import "./style.css";

interface Props {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onReset: () => void;
    /** Omitted entirely when the puzzle has no declared solution to check against (#52). */
    onCheck?: () => void;
    /** Items listed above Reset in the menu (on a phone: the timer and the zoom controls). */
    extraItems?: readonly MenuItem[];
}

/** The frequent actions (Undo, Redo, Check) sit in one row; Reset, which throws the
 *  whole attempt away, lives in the menu at the end of it behind a confirm step. */
export default function Controls({ canUndo, canRedo, onUndo, onRedo, onReset, onCheck, extraItems = [] }: Props) {
    return (
        <div className="controls">
            <button className="btn btn-flat" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
                <Undo2 size={16} /> Undo
            </button>
            <button className="btn btn-flat" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
                <Redo2 size={16} /> Redo
            </button>
            {onCheck && (
                <button
                    className="btn"
                    onClick={onCheck}
                    title="Check against the solution (V) — a second press (with no edits in between) reveals exactly what's wrong"
                >
                    <BadgeCheck size={16} /> Check
                </button>
            )}
            <OverflowMenu
                label="More actions"
                flat
                up
                items={[
                    ...extraItems,
                    {
                        label: "Reset puzzle",
                        confirm: "Really clear everything?",
                        icon: <RotateCcw size={16} />,
                        onSelect: onReset,
                    },
                ]}
            />
        </div>
    );
}
