import { useSyncExternalStore } from "react";

/** Whether a CSS media query currently matches, kept live. False where matchMedia doesn't exist (jsdom). */
export const useMediaQuery = (query: string): boolean =>
    useSyncExternalStore(
        (onChange) => {
            if (typeof window.matchMedia !== "function") return () => undefined;
            const list = window.matchMedia(query);
            list.addEventListener("change", onChange);
            return () => list.removeEventListener("change", onChange);
        },
        () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
        () => false,
    );
