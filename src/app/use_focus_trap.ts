import { useEffect, useRef, useState, type KeyboardEvent } from "react";

const FOCUSABLE =
    'a[href], button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus handling.
 * On mount, it focuses the first control in the container.
 * It keeps Tab/Shift+Tab in a cycle inside the container.
 * On unmount, it returns focus to the element that had focus before the modal opened (the trigger button).
 * Spread `onKeyDown` on the container and attach `ref` to it.
 */
export const useFocusTrap = <T extends HTMLElement>() => {
    const ref = useRef<T>(null);
    // Read during the first render, before the autoFocus of the modal fires at commit.
    // So this value is still the trigger, not an element inside the modal.
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
