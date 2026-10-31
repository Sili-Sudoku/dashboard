import { useSyncExternalStore } from "react";
import { X } from "lucide-react";

import { dismissToast, getToasts, pauseToast, resumeToast, subscribe } from "@/app/toast.ts";

import "./toast.css";

/** Mounted once in the app shell; renders whatever `toast()` has queued. */
export function ToastViewport() {
    const current = useSyncExternalStore(subscribe, getToasts);
    return (
        <div className="toast-viewport">
            {current.map((t) => (
                // role=alert interrupts a screen reader, so only errors get it;
                // the rest are polite status updates.
                // Pointer-over or keyboard focus holds it on screen; leaving resumes
                // the countdown from where it stopped.
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
                    {/* The countdown: drains over the toast's lifetime; CSS pauses it
                        in step with the timer above while hovered/focused. */}
                    <span className="toast-timer" style={{ animationDuration: `${t.duration}ms` }} aria-hidden="true" />
                </div>
            ))}
        </div>
    );
}
