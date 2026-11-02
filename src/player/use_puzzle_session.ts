/**
 * Connects the framework-agnostic `PuzzleSession` to React.
 * It adds two interaction pieces that belong to the app, not to the runtime:
 * keyboard input and progress persistence.
 */

import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { getSettings } from "@/app/use_settings.ts";
import { dismissToastByKey, toast } from "@/app/toast.ts";
import type { CompiledPuzzle } from "@/runtime/puzzle.ts";
import type { Direction } from "@/runtime/geometry.ts";
import { sanitizePen } from "@/runtime/pen.ts";
import {
    PuzzleSession,
    penStorageKey,
    progressStorageKey,
    statsStorageKey,
    type InputMode,
    type ProgressSnapshot,
    type PuzzleStats,
} from "@/runtime/session.ts";

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
        // Storage is not available (for example private mode). Progress is not persisted.
    }
};

const readPen = (id: string) => {
    try {
        const raw = localStorage.getItem(penStorageKey(id));
        return raw ? sanitizePen(JSON.parse(raw)) : undefined;
    } catch {
        return undefined;
    }
};

const writePen = (id: string, pen: ReturnType<PuzzleSession["toPen"]>): void => {
    try {
        if (pen.segments.length === 0 && Object.keys(pen.marks).length === 0)
            localStorage.removeItem(penStorageKey(id));
        else localStorage.setItem(penStorageKey(id), JSON.stringify(pen));
    } catch {
        // Storage is not available. The pen layer is not persisted.
    }
};

const readStats = (id: string): PuzzleStats | undefined => {
    try {
        const raw = localStorage.getItem(statsStorageKey(id));
        return raw ? (JSON.parse(raw) as PuzzleStats) : undefined;
    } catch {
        return undefined;
    }
};

const writeStats = (id: string, stats: PuzzleStats): void => {
    try {
        localStorage.setItem(statsStorageKey(id), JSON.stringify(stats));
    } catch {
        // Storage is not available. Stats are not persisted.
    }
};

const ARROW_KEYS: Record<string, Direction> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
};

/**
 * Gets the digit from the physical key code, not from `e.key`.
 * On many layouts a held Shift changes `e.key` for the top-row digits (for example Shift+1 -> "!").
 */
const digitFromCode = (code: string): number | null => {
    const match = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    return match ? Number(match[1]) : null;
};

/** Does a *different*, longer domain value start with the digits of `prefix`?
 *  That is: can one more keypress extend `prefix` into a different, valid value? */
const hasLongerMatch = (domain: readonly number[], prefix: string): boolean =>
    domain.some((v) => v !== Number(prefix) && String(v).startsWith(prefix));

/** Commit delay for multi-digit entry (#large-domain follow-up).
 * It is long enough for a deliberate second keystroke and short enough that the key does not feel stuck. */
const DIGIT_COMMIT_DELAY_MS = 500;

const CHECK_TOAST_KEY = "check";

/** A second history that Undo/Redo of the board uses when its own history (entered digits and notes) is empty.
 *  It holds the edits of the Author page to the puzzle definition (#116).
 *  So one Undo/Redo control covers both. */
export interface ExternalHistory {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
}

/**
 * `scope` is the root element of the player.
 * Keyboard shortcuts fire only for key events that start inside it (focused board, number pad, controls).
 * So typing elsewhere on the page (a dialog, the site header) cannot edit a cell.
 */
export const usePuzzleSession = (
    puzzle: CompiledPuzzle,
    scope: RefObject<HTMLElement | null>,
    externalHistory?: ExternalHistory,
) => {
    const session = useMemo(
        () =>
            new PuzzleSession(puzzle, {
                initialProgress: readProgress(puzzle.metadata.id),
                initialPen: readPen(puzzle.metadata.id),
                checkNotesOnLeave: getSettings().checkNotesOnLeave,
            }),
        [puzzle],
    );

    useSyncExternalStore(
        useCallback((cb) => session.subscribe(cb), [session]),
        () => session.revision,
    );

    // The check result is a transient toast, not board state.
    // A *revealed* mistake stays red and flagged until it is fixed.
    // A plain confirmation has nothing to keep showing.
    // The result is here, not in the component, so the Check button and the 'V' hotkey below
    // give the same feedback. The keyboard is a shortcut for the same action.
    const check = useCallback(() => {
        const outcome = session.checkAgainstSolution();
        if (outcome === "revealed") {
            // No toast. The highlighted cells are the feedback.
            dismissToastByKey(CHECK_TOAST_KEY);
            return;
        }
        if (outcome === "clean")
            toast("Everything is correct", { kind: "success", key: CHECK_TOAST_KEY, duration: 2500 });
        else if (outcome === "mistake-value")
            toast("At least 1 digit entered is wrong", { kind: "error", key: CHECK_TOAST_KEY, duration: 2500 });
        else
            toast("At least 1 note removes the correct digit", {
                kind: "error",
                key: CHECK_TOAST_KEY,
                duration: 2500,
            });
    }, [session]);

    // Undo/redo: the history of the board first, then the external history (if given).
    // Use a ref. Then the keyboard handler below always sees the latest callbacks,
    // and it does not register again on each render.
    const externalRef = useRef(externalHistory);
    useEffect(() => {
        externalRef.current = externalHistory;
    });
    const undo = useCallback(() => {
        if (session.canUndo) session.undo();
        else if (externalRef.current?.canUndo) externalRef.current.undo();
    }, [session]);
    const redo = useCallback(() => {
        if (session.canRedo) session.redo();
        else if (externalRef.current?.canRedo) externalRef.current.redo();
    }, [session]);

    // Persist progress after each change.
    const saveTimer = useRef<number | undefined>(undefined);
    useEffect(() => {
        return session.subscribe(() => {
            window.clearTimeout(saveTimer.current);
            saveTimer.current = window.setTimeout(() => {
                writeProgress(puzzle.metadata.id, session.toProgress());
                writePen(puzzle.metadata.id, session.toPen());
            }, 150);
        });
    }, [session, puzzle.metadata.id]);

    // Solve timer (#68): a plain stopwatch that runs while the puzzle is not complete.
    // The interval and subscribe callbacks and the effect cleanup below drive it.
    // The render body never drives it, and no ref is read during render.
    // This project lints against both (react-hooks rules).
    // `elapsedBase` and `runningTimer` are plain mutable bookkeeping, not render input.
    // `elapsedBase` is the running total at the last pause (tick stop, completion, or manual reset).
    // `runningTimer` tells a stale cleanup that it must not add a leftover delta to the fresh zero.
    // A stale cleanup is one that fires after `resetTimer` zeroed everything.
    // Completion is detected with `session.subscribe`,
    // not by a poll of `evaluation.complete` in the interval tick.
    // A poll lets the clock run up to one second past the real solve before it notices.
    // That inflates the recorded time by the same amount.
    const initialStats = useMemo(() => readStats(puzzle.metadata.id), [puzzle.metadata.id]);
    const [elapsedMs, setElapsedMs] = useState(() => initialStats?.elapsedMs ?? 0);
    const [bestElapsedMs, setBestElapsedMs] = useState(() => initialStats?.bestElapsedMs);
    const elapsedBase = useRef(initialStats?.elapsedMs ?? 0);
    const resumedAt = useRef(0);
    const runningTimer = useRef(false);
    const [tickGeneration, setTickGeneration] = useState(0);

    useEffect(() => {
        if (session.evaluation.complete) return; // already solved: nothing to tick
        resumedAt.current = Date.now();
        runningTimer.current = true;

        const finish = () => {
            window.clearInterval(id);
            unsubscribe();
            runningTimer.current = false;
            elapsedBase.current += Date.now() - resumedAt.current;
            const finalElapsed = elapsedBase.current;
            setElapsedMs(finalElapsed);
            setBestElapsedMs((prev) => {
                const best = prev === undefined ? finalElapsed : Math.min(prev, finalElapsed);
                writeStats(puzzle.metadata.id, { elapsedMs: finalElapsed, bestElapsedMs: best });
                return best;
            });
        };

        const id = window.setInterval(() => {
            const current = elapsedBase.current + (Date.now() - resumedAt.current);
            setElapsedMs(current);
            // `bestElapsedMs` changes only at completion, which stops this interval.
            // So the value that this closure holds stays accurate while the interval runs.
            writeStats(puzzle.metadata.id, { elapsedMs: current, bestElapsedMs });
        }, 1000);

        const unsubscribe = session.subscribe(() => {
            if (session.evaluation.complete) finish();
        });

        return () => {
            window.clearInterval(id);
            unsubscribe();
            if (runningTimer.current) {
                runningTimer.current = false;
                elapsedBase.current += Date.now() - resumedAt.current;
            }
        };
    }, [session, puzzle.metadata.id, tickGeneration, bestElapsedMs]);

    const resetTimer = useCallback(() => {
        runningTimer.current = false;
        elapsedBase.current = 0;
        setElapsedMs(0);
        setTickGeneration((g) => g + 1);
    }, []);

    // Keyboard interaction.
    // While Shift/Ctrl/Cmd is held alone (no other key yet), the number pad previews the mode that the key applies.
    // On release, the held state restores `baseMode`, so the pad is not stuck in that mode.
    const baseMode = useRef<InputMode>(session.inputMode);
    const modifierHeld = useRef(false);

    // Multi-digit entry (#large-domain follow-up): domains past 1-9 (for example 1-25 of a 25x25 puzzle)
    // need more than one keypress per value.
    // In "digit" mode, each keystroke applies live.
    // The first keystroke uses input() (one undo step, instant feedback, no wait).
    // A further digit that extends it uses replaceValue() (same undo step, it only corrects the preview).
    // So entry of "20" never looks like nothing happened while the code waits for a second digit.
    // In the note modes, a toggle is a flip, not an overwrite, so there is no live preview.
    // Notes resolve once, as before.
    const digitBuffer = useRef("");
    const digitTimer = useRef<number | undefined>(undefined);
    const applyingOwnChange = useRef(false);

    useEffect(() => {
        const resetBuffer = () => {
            digitBuffer.current = "";
            window.clearTimeout(digitTimer.current);
        };

        const applyOwnChange = (fn: () => void) => {
            applyingOwnChange.current = true;
            fn();
            applyingOwnChange.current = false;
        };

        const resolveNoteBuffer = () => {
            const raw = digitBuffer.current;
            resetBuffer();
            if (raw === "") return;
            const n = Number(raw);
            if (puzzle.domain.includes(n)) applyOwnChange(() => session.input(n));
        };

        const pushDigit = (digitChar: string) => {
            // Colour mode: the digit picks a palette colour.
            // So there is no multi-digit value to buffer, whatever the domain of the puzzle.
            if (session.inputMode === "color") {
                session.input(Number(digitChar));
                return;
            }
            // Domains with single digits only behave as before:
            // instant commit, no wait for a second keystroke.
            if (!puzzle.domain.some((v) => v >= 10)) {
                session.input(Number(digitChar));
                return;
            }

            const isNoteMode = session.inputMode !== "digit";
            let continuing = digitBuffer.current !== "";
            let next = digitBuffer.current + digitChar;

            if (!puzzle.domain.includes(Number(next)) && !hasLongerMatch(puzzle.domain, next)) {
                // Dead end for the buffered digits.
                // In digit mode, they already show (applied live as typed), so there is nothing to flush.
                // Start over.
                // In note mode, nothing is toggled yet. Resolve the buffer now,
                // then start over with this digit.
                if (isNoteMode) resolveNoteBuffer();
                else resetBuffer();
                next = digitChar;
                continuing = false;
                if (!puzzle.domain.includes(Number(next)) && !hasLongerMatch(puzzle.domain, next)) return;
            }

            digitBuffer.current = next;
            const resolved = !hasLongerMatch(puzzle.domain, next);
            const isValid = puzzle.domain.includes(Number(next));

            if (!isNoteMode && isValid) {
                const n = Number(next);
                applyOwnChange(() => (continuing ? session.replaceValue(n) : session.input(n)));
            }

            window.clearTimeout(digitTimer.current);
            if (resolved) {
                if (isNoteMode && isValid) applyOwnChange(() => session.input(Number(next)));
                digitBuffer.current = "";
            } else {
                digitTimer.current = window.setTimeout(() => {
                    if (isNoteMode) resolveNoteBuffer();
                    else resetBuffer();
                }, DIGIT_COMMIT_DELAY_MS);
            }
        };

        // Finishes the buffered digits when the player does something else (moves the cursor, erases, switches mode).
        // It does not wait for the timer.
        // Digit mode already applied the digits live, so it only drops the buffer.
        // Note mode did not toggle anything yet, so it must resolve the buffer now.
        const flushBuffer = () => {
            if (session.inputMode === "digit") resetBuffer();
            else resolveNoteBuffer();
        };

        // Any board change that is not our own live-applied digit (a NumberPad click, undo/redo)
        // invalidates the pending buffer.
        // So a stale buffer does not extend into a later keystroke and overwrite that other change.
        const unsubscribe = session.subscribe(() => {
            if (applyingOwnChange.current) return;
            resetBuffer();
        });

        const isInputTarget = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            return (
                !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
            );
        };

        /** Focus is on a control. Its own Enter/Space behaviour must stay. */
        const isActivatable = () => {
            const active = document.activeElement;
            return active instanceof HTMLElement && !!active.closest("button, a[href], summary, select, [role=button]");
        };

        /**
         * The board is a Tab stop.
         * While it has focus, Tab/Shift+Tab move to the next/previous empty cell, but never wrap.
         * At the last (first) empty cell, Tab goes on to the normal focus order.
         * So keyboard users can always leave the board (no keyboard trap).
         */
        const isBoardFocused = () => {
            const active = document.activeElement;
            return active instanceof SVGElement && active.classList.contains("board");
        };

        const restoreMode = () => {
            session.setInputMode(baseMode.current);
            modifierHeld.current = false;
        };

        /**
         * Events carry the real modifier state. If the preview is on but no modifier is down any more,
         * the key-up never reached us, so the mode must go back now. That key-up can be lost when focus
         * moved out of the player or into a text field while the key was held.
         */
        const healStaleModifier = (e: KeyboardEvent | PointerEvent) => {
            if (modifierHeld.current && !e.shiftKey && !e.ctrlKey && !e.metaKey) restoreMode();
        };

        const onKeyDown = (e: KeyboardEvent) => {
            healStaleModifier(e);
            if (isInputTarget(e)) return;

            const isPlainDigit = /^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.shiftKey;
            // Any other action commits the buffered digits of a part-typed multi-digit value,
            // so they do not land later.
            if (!isPlainDigit) flushBuffer();

            if (e.key in ARROW_KEYS) {
                e.preventDefault();
                session.moveCursor(ARROW_KEYS[e.key], e.shiftKey);
                return;
            }
            // Ctrl/Cmd+<digit> toggles a centre note. Shift+<digit> toggles a corner note.
            // Both act directly, whatever the current note-mode toggle is.
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
            // Bare modifier press (no digit yet): preview that mode on the pad.
            // Shift alone previews corner. Ctrl/Cmd previews centre.
            // The preview lasts while the key is down.
            if (e.key === "Shift" || e.key === "Control" || e.key === "Meta") {
                if (!modifierHeld.current) {
                    baseMode.current = session.inputMode;
                    modifierHeld.current = true;
                }
                session.setInputMode(e.key === "Shift" ? "corner" : "center");
                return;
            }
            // "0" is a plain digit here, as any other digit.
            // It means "erase" only in domains that do not include it.
            // input() and pushDigit() already do nothing for a digit outside the domain,
            // so 0 needs no special code.
            if (isPlainDigit) {
                pushDigit(e.key);
                return;
            }
            if (e.key === "Backspace" || e.key === "Delete") {
                e.preventDefault();
                session.erase();
                return;
            }
            if (e.key === " ") {
                if (isActivatable()) return;
                e.preventDefault();
                session.setInputMode(session.inputMode === "digit" ? "corner" : "digit");
                return;
            }
            if (e.key === "Tab" && isBoardFocused()) {
                if (session.jumpToEmptyCell(e.shiftKey ? -1 : 1, false)) e.preventDefault();
                return;
            }
            if (e.key === "Enter") {
                if (isActivatable()) return;
                e.preventDefault();
                session.selectSameValue();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
                e.preventDefault();
                redo();
                return;
            }
            // SudokuPad 'V' check (#52).
            // PuzzleSession does nothing if the puzzle has no declared solution, so no gate is needed here.
            if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "v") {
                e.preventDefault();
                check();
                return;
            }
            if (e.key === "Escape") session.selectNone();
        };

        const onKeyUp = (e: KeyboardEvent) => {
            if (!modifierHeld.current) return;
            if (e.key !== "Shift" && e.key !== "Control" && e.key !== "Meta") return;

            if (e.ctrlKey || e.metaKey) session.setInputMode("center");
            else if (e.shiftKey) session.setInputMode("corner");
            else restoreMode();
        };

        const onBlur = () => {
            flushBuffer();
            if (modifierHeld.current) restoreMode();
        };

        const root = scope.current;
        root?.addEventListener("keydown", onKeyDown);
        // The key-up listens on the window, not on the player. The player does not see the release
        // when focus is elsewhere (another control, a text field, outside the player) at that moment.
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("pointerdown", healStaleModifier);
        window.addEventListener("blur", onBlur);
        return () => {
            unsubscribe();
            window.clearTimeout(digitTimer.current);
            digitBuffer.current = "";
            root?.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("pointerdown", healStaleModifier);
            window.removeEventListener("blur", onBlur);
        };
    }, [session, scope, puzzle.domain, check, undo, redo]);

    return {
        session,
        check,
        undo,
        redo,
        canUndo: session.canUndo || !!externalHistory?.canUndo,
        canRedo: session.canRedo || !!externalHistory?.canRedo,
        elapsedMs,
        bestElapsedMs,
        resetTimer,
    };
};
