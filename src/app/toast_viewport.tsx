import { useSyncExternalStore } from "react";
import { X } from "lucide-react";

import { dismissToast, getToasts, pauseToast, resumeToast, subscribe } from "@/app/toast.ts";

import "./toast.css";

/** Mounted once in the app shell. Renders the toasts that `toast()` queues. */
export function ToastViewport() {
    const current = useSyncExternalStore(subscribe, getToasts);
    return (
        <div className="toast-viewport">
            {current.map((t) => (
                // role=alert interrupts a screen reader, so only errors get it.
                // The other toasts are polite status updates.
                // Pointer-over or keyboard focus holds the toast on screen.
                // When the pointer or focus leaves, the countdown continues from where it stopped.
                <div
                    key={t.id}
                    className={`toast toast-${t.kind}`}
                    role={t.kind === "error" ? "alert" : "status"}
                    onPointerEnter={() => pauseToast(t.id)}
                    onPointerLeave={() => resumeToast(t.id)}
                    onFocus={() => pauseToast(t.id)}
                    onBlur={() => resumeToast(t.id)}
                >
                    <span className="toast-message">{t.message}</span>
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
                        <X size={14} />
                    </button>
                    {/* The countdown drains over the toast's lifetime.
                        CSS pauses it with the timer above while the toast has hover or focus. */}
                    <span className="toast-timer" style={{ animationDuration: `${t.duration}ms` }} aria-hidden="true" />
                </div>
            ))}
        </div>
    );
}
