import { useFocusTrap } from "@/app/use_focus_trap.ts";

export interface ImportDialogProps {
    title: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    onCancel: () => void;
    onSubmit: () => void;
}

/** An in-app replacement for `window.prompt`: browsers let a user permanently
 *  suppress native dialogs after a few show up (and the native one is a
 *  single-line input anyway, which is awkward for pasting multi-line JSON). */
export default function ImportDialog({ title, placeholder, value, onChange, onCancel, onSubmit }: ImportDialogProps) {
    const { ref, onKeyDown } = useFocusTrap<HTMLDivElement>();
    return (
        <div className="author-dialog-backdrop" onClick={onCancel}>
            <div
                className="author-dialog"
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
                <textarea
                    value={value}
                    placeholder={placeholder}
                    onChange={(e) => onChange(e.target.value)}
                    spellCheck={false}
                />
                <div className="author-dialog-actions">
                    <button className="btn" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={onSubmit} disabled={!value.trim()}>
                        Import
                    </button>
                </div>
            </div>
        </div>
    );
}
