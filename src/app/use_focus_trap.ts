import { useEffect, useRef, useState, type KeyboardEvent } from "react";

const FOCUSABLE =
    'a[href], button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus handling: on mount focuses the first control inside the
 * container, keeps Tab/Shift+Tab cycling within it, and on unmount returns
 * focus to whatever had it before the modal opened (the trigger button).
 * Spread `onKeyDown` on the container and attach `ref` to it.
 */
export const useFocusTrap = <T extends HTMLElement>() => {
    const ref = useRef<T>(null);
    // Read during the first render, i.e. before the modal's own autoFocus
    // fires at commit — so this is still the trigger, not something inside.
    const [opener] = useState(() => document.activeElement);

    useEffect(() => {
        const container = ref.current;
        if (container && !container.contains(document.activeElement)) {
            container.querySelector<HTMLElement>(FOCUSABLE)?.focus();
        }
        return () => {
            if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
        };
    }, [opener]);

    const onKeyDown = (e: KeyboardEvent<T>) => {
        if (e.key !== "Tab") return;
        const items = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !e.currentTarget.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || !e.currentTarget.contains(active))) {
            e.preventDefault();
            first.focus();
        }
    };

    return { ref, onKeyDown };
};
