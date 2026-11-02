import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

import { toast } from "@/app/toast.ts";

/** The browser's deferred install prompt (Chromium only; not in lib.dom). */
interface InstallPromptEvent extends Event {
    prompt(): Promise<void>;
}

let installEvent: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Call once at startup: registers the service worker and wires up the toasts and install prompt. */
export const initPwa = (): void => {
    if (import.meta.env.DEV) return; // no service worker in the dev server
    registerSW({ onOfflineReady: () => toast("Ready to work offline.", { key: "pwa" }) });

    window.addEventListener("offline", () =>
        toast("You're offline. Saved puzzles and progress still work.", { key: "net" }),
    );
    window.addEventListener("online", () => toast("Back online.", { key: "net", kind: "success" }));
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        installEvent = e as InstallPromptEvent;
        emit();
    });
    window.addEventListener("appinstalled", () => {
        installEvent = null;
        emit();
    });
};

const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
};

/** Returns an install function, or null when the browser isn't offering to install the app. */
export const useInstall = (): (() => void) | null => {
    const event = useSyncExternalStore(subscribe, () => installEvent);
    return event ? () => void event.prompt() : null;
};
