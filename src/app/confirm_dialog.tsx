import type { ReactNode } from "react";

import { useFocusTrap } from "@/app/use_focus_trap.ts";

import "./confirm_dialog.css";

interface Props {
    title: string;
    children: ReactNode;
    confirmLabel: string;
    /** The label of the way out (default "Cancel"). */
    cancelLabel?: string;
    onCancel: () => void;
    onConfirm: () => void;
}

/**
 * A question that needs a yes before an action that cannot be taken back (leaving the site, for example).
 * The way out comes first, so it has the focus when the dialog opens: Enter does not confirm by accident.
 * Escape and a click outside cancel.
 */
export default function ConfirmDialog({
    title,
    children,
    confirmLabel,
    cancelLabel = "Cancel",
    onCancel,
    onConfirm,
}: Props) {
    const { ref, onKeyDown } = useFocusTrap<HTMLDivElement>();
    return (
        <div className="confirm-backdrop" onClick={onCancel}>
            <div
                className="confirm-dialog"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                ref={ref}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    if (e.key === "Escape") onCancel();
                    onKeyDown(e);
                }}
            >
                <h3>{title}</h3>
                <div className="confirm-body">{children}</div>
                <div className="confirm-actions">
                    <button type="button" className="btn" onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={onConfirm}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
