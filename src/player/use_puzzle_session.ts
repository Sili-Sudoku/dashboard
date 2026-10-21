/**
 * Bridges the framework-agnostic `PuzzleSession` into React and wires the two
 * pieces of interaction that belong to the app rather than the runtime:
 * keyboard input and progress persistence.
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { CompiledPuzzle } from "@/runtime/puzzle.ts";
import type { Direction } from "@/runtime/geometry.ts";
import { PuzzleSession, progressStorageKey, type InputMode, type ProgressSnapshot } from "@/runtime/session.ts";

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

/**
 * Digit from the physical key code rather than `e.key`, since on many layouts
 * a held Shift changes `e.key` for the top-row digits (e.g. Shift+1 -> "!").
 */
const digitFromCode = (code: string): number | null => {
    const match = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    return match ? Number(match[1]) : null;
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
    // While Shift/Ctrl/Cmd is held on its own (no other key yet), the number
    // pad previews the mode that key would apply — held state restores
    // `baseMode` on release rather than leaving the pad stuck in that mode.
    const baseMode = useRef<InputMode>(session.inputMode);
    const modifierHeld = useRef(false);

    useEffect(() => {
        const isInputTarget = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
        };

        /**
         * Tab/Shift+Tab jump to the next/previous empty cell, but only when
         * nothing else on the page is focused — otherwise Tab keeps its normal
         * job of moving focus between buttons/controls (accessibility).
         */
        const isInteractiveFocus = () => {
            const active = document.activeElement;
            return active instanceof HTMLElement && active !== document.body && active.tagName !== "svg";
        };

        const restoreMode = () => {
            session.setInputMode(baseMode.current);
            modifierHeld.current = false;
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (isInputTarget(e)) return;

            if (e.key in ARROW_KEYS) {
                e.preventDefault();
                session.moveCursor(ARROW_KEYS[e.key], e.shiftKey);
                return;
            }
            // Ctrl/Cmd+<digit> toggles a centre note; Shift+<digit> toggles a corner
            // note — both directly, regardless of the current note-mode toggle.
            // Note: some browsers reserve Ctrl+1-9 for tab switching.
            if (e.ctrlKey || e.metaKey) {
                const digit = digitFromCode(e.code);
                if (digit !== null) {
                    e.preventDefault();
                    session.toggleCenterNote(digit);
                    return;
                }
            } else if (e.shiftKey) {
                const digit = digitFromCode(e.code);
                if (digit !== null) {
                    e.preventDefault();
                    session.toggleCornerNote(digit);
                    return;
                }
            }
            // Bare modifier press (no digit yet): preview that mode on the pad —
            // held held alone previews corner, Ctrl/Cmd previews centre — for as
            // long as the key stays down.
            if (e.key === "Shift" || e.key === "Control" || e.key === "Meta") {
                if (!modifierHeld.current) {
                    baseMode.current = session.inputMode;
                    modifierHeld.current = true;
                }
                session.setInputMode(e.key === "Shift" ? "corner" : "center");
                return;
            }
            // "0" is a plain digit here, same as any other — it only means "erase"
            // in domains that don't include it, and input() already no-ops on a
            // digit outside the domain, so there's nothing special to do for it.
            if (/^[0-9]$/.test(e.key)) {
                session.input(Number(e.key));
                return;
            }
            if (e.key === "Backspace" || e.key === "Delete") {
                e.preventDefault();
                session.erase();
                return;
            }
            if (e.key === " ") {
                e.preventDefault();
                session.setInputMode(session.inputMode === "digit" ? "corner" : "digit");
                return;
            }
            if (e.key === "Tab" && !isInteractiveFocus()) {
                e.preventDefault();
                session.jumpToEmptyCell(e.shiftKey ? -1 : 1);
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                session.selectSameValue();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) session.redo();
                else session.undo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
                e.preventDefault();
                session.redo();
                return;
            }
            if (e.key === "Escape") session.selectNone();
        };

        const onKeyUp = (e: KeyboardEvent) => {
            if (!modifierHeld.current || isInputTarget(e)) return;
            if (e.key !== "Shift" && e.key !== "Control" && e.key !== "Meta") return;

            if (e.ctrlKey || e.metaKey) session.setInputMode("center");
            else if (e.shiftKey) session.setInputMode("corner");
            else restoreMode();
        };

        const onBlur = () => {
            if (modifierHeld.current) restoreMode();
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        };
    }, [session]);

    return session;
};
