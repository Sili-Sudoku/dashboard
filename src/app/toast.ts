/**
 * The one mechanism for short feedback to an action the user just did.
 * Examples are a check result, an import/export outcome, and a solve result.
 * A toast floats over the page and takes no layout space, so it cannot shift anything.
 * Persistent *state* is not a toast. Examples are a JSON parse error, "Solved!", and a missing puzzle.
 * Such state describes the current situation, and stays inline until the cause is fixed.
 * See docs/UI_PLACEMENT.md.
 *
 * The store is at module level (like use_settings.ts), so callers use `toast(...)` from anywhere.
 * <ToastViewport /> is mounted once in the app shell.
 */
export type ToastKind = "info" | "success" | "error";

export interface ToastItem {
    id: number;
    key: string;
    kind: ToastKind;
    message: string;
    /** Total lifetime in ms. The viewport animates its countdown bar over this time. */
    duration: number;
}

interface ToastOptions {
    kind?: ToastKind;
    /** A new toast with the same key replaces the old one. It does not stack.
     *  For example, repeated presses of Check show one toast, not five. */
    key?: string;
    /** ms before the toast dismisses itself. Errors default to a longer time. */
    duration?: number;
}

let nextId = 1;
let items: readonly ToastItem[] = [];
/** Pending auto-dismiss for each toast. It keeps enough data to pause (hover/focus)
 *  and to resume with the time that remains. */
const timers = new Map<number, { handle: ReturnType<typeof setTimeout>; startedAt: number; remaining: number }>();

const startTimer = (id: number, remaining: number) => {
    timers.set(id, { handle: setTimeout(() => dismissToast(id), remaining), startedAt: Date.now(), remaining });
};
const listeners = new Set<() => void>();
const paused = new Set<number>();

const emit = () => {
    for (const l of listeners) l();
};

export const dismissToast = (id: number): void => {
    clearTimeout(timers.get(id)?.handle);
    timers.delete(id);
    items = items.filter((t) => t.id !== id);
    emit();
};

export const dismissToastByKey = (key: string): void => {
    for (const t of items.filter((x) => x.key === key)) dismissToast(t.id);
};

export const toast = (message: string, { kind = "info", key, duration }: ToastOptions = {}): void => {
    const id = nextId++;
    const k = key ?? `toast-${id}`;
    for (const old of items.filter((t) => t.key === k)) dismissToast(old.id);
    const total = duration ?? (kind === "error" ? 8000 : 4000);
    items = [...items, { id, key: k, kind, message, duration: total }];
    startTimer(id, total);
    emit();
};

/** Hold a toast on screen (pointer over it or keyboard focus inside it). */
export const pauseToast = (id: number): void => {
    const t = timers.get(id);
    if (!t || paused.has(id)) return;
    clearTimeout(t.handle);
    t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt));
    paused.add(id);
};

export const resumeToast = (id: number): void => {
    const t = timers.get(id);
    if (!t || !paused.delete(id)) return;
    startTimer(id, t.remaining);
};

/** For tests: remove all toasts and cancel the pending timers. */
export const clearToasts = (): void => {
    for (const t of timers.values()) clearTimeout(t.handle);
    timers.clear();
    paused.clear();
    items = [];
    emit();
};

export const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
        listeners.delete(l);
    };
};

export const getToasts = (): readonly ToastItem[] => items;
