/**
 * Bridges the framework-agnostic `PuzzleSession` into React and wires the two
 * pieces of interaction that belong to the app rather than the runtime:
 * keyboard input and progress persistence.
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { CompiledPuzzle } from "@/runtime/puzzle.ts";
import type { Direction } from "@/runtime/geometry.ts";
import { PuzzleSession, progressStorageKey, type ProgressSnapshot } from "@/runtime/session.ts";

const readProgress = (id: string): ProgressSnapshot | undefined => {
    try {
        const raw = localStorage.getItem(progressStorageKey(id));
        return raw ? (JSON.parse(raw) as ProgressSnapshot) : undefined;
    } catch {
        return undefined;
    }
};

const writeProgress = (id: string, snapshot: ProgressSnapshot): void => {
    try {
        localStorage.setItem(progressStorageKey(id), JSON.stringify(snapshot));
    } catch {
        // storage unavailable (private mode etc.) — progress just isn't persisted
    }
};

const ARROW_KEYS: Record<string, Direction> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
};

export const usePuzzleSession = (puzzle: CompiledPuzzle) => {
    const session = useMemo(
        () => new PuzzleSession(puzzle, { initialProgress: readProgress(puzzle.metadata.id) }),
        [puzzle],
    );

    useSyncExternalStore(
        useCallback((cb) => session.subscribe(cb), [session]),
        () => session.revision,
    );

    // Persist progress after each change.
    const saveTimer = useRef<number | undefined>(undefined);
    useEffect(() => {
        return session.subscribe(() => {
            window.clearTimeout(saveTimer.current);
            saveTimer.current = window.setTimeout(() => {
                writeProgress(puzzle.metadata.id, session.toProgress());
            }, 150);
        });
    }, [session, puzzle.metadata.id]);

    // Keyboard interaction.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

            if (e.key in ARROW_KEYS) {
                e.preventDefault();
                session.moveCursor(ARROW_KEYS[e.key], e.shiftKey);
                return;
            }
            if (/^[0-9]$/.test(e.key)) {
                const n = Number(e.key);
                if (n >= 1) session.input(n);
                return;
            }
            if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
                session.erase();
                return;
            }
            if (e.key === " ") {
                e.preventDefault();
                session.setNoteMode(!session.noteMode);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) session.redo();
                else session.undo();
                return;
            }
            if (e.key === "Escape") session.selectNone();
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [session]);

    return session;
};
