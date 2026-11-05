import { RotateCcw, Undo2, Redo2, BadgeCheck } from "lucide-react";

import { OverflowMenu, type MenuItem } from "@/app/overflow_menu.tsx";

import "./style.css";

interface Props {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onReset: () => void;
    /** Omitted when the puzzle has no solution to check against. Check is then shown disabled. */
    onCheck?: () => void;
    /** Items above Reset in the menu (on a phone: the timer and the zoom controls). */
    extraItems?: readonly MenuItem[];
}

/** The frequent actions (Undo, Redo, Check) are in one row.
 *  Reset throws the whole attempt away. It is in the menu at the end of the row, behind a confirm step. */
export default function Controls({ canUndo, canRedo, onUndo, onRedo, onReset, onCheck, extraItems = [] }: Props) {
    return (
        <div className="controls">
            <button className="btn btn-flat" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
                <Undo2 size={16} /> Undo
            </button>
            <button className="btn btn-flat" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
                <Redo2 size={16} /> Redo
            </button>
            <button
                className="btn"
                onClick={onCheck}
                disabled={!onCheck}
                title={
                    onCheck
                        ? "Check against the solution (V). Press again with no edits to show what is wrong."
                        : "Check needs one known solution. This puzzle has none, or has more than one."
                }
            >
                <BadgeCheck size={16} /> Check
            </button>
            <OverflowMenu
                label="More actions"
                flat
                up
                items={[
                    ...extraItems,
                    {
                        label: "Reset puzzle",
                        confirm: "Clear everything?",
                        icon: <RotateCcw size={16} />,
                        onSelect: onReset,
                    },
                ]}
            />
        </div>
    );
}
