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

/** Does some *other*, longer domain value start with `prefix`'s digits? i.e. could
 *  one more keypress extend `prefix` into a different, still-valid value. */
const hasLongerMatch = (domain: readonly number[], prefix: string): boolean =>
    domain.some((v) => v !== Number(prefix) && String(v).startsWith(prefix));

/** Multi-digit-aware commit delay (#large-domain follow-up): long enough for a
 * deliberate second keystroke, short enough not to feel like a stuck key. */
const DIGIT_COMMIT_DELAY_MS = 500;

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

    // Multi-digit entry (#large-domain follow-up): domains past 1-9 (e.g. a
    // 25x25 puzzle's 1-25) need more than one keypress per value. In "digit"
    // mode, each keystroke is applied live — the first via input() (one undo
    // step, instant feedback instead of a wait to see anything happen) and
    // any further digit that extends it via replaceValue() (same undo step,
    // just correcting the preview) — so entering "20" never looks like
    // nothing happened while waiting to see if a second digit follows. In the
    // note modes, toggling is a flip rather than an overwrite, so there's no
    // equivalent live preview — notes resolve once, same as before.
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
            // Domains that are entirely single digits behave exactly as before —
            // instant commit, no waiting around for a second keystroke.
            if (!puzzle.domain.some((v) => v >= 10)) {
                session.input(Number(digitChar));
                return;
            }

            const isNoteMode = session.inputMode !== "digit";
            let continuing = digitBuffer.current !== "";
            let next = digitBuffer.current + digitChar;

            if (!puzzle.domain.includes(Number(next)) && !hasLongerMatch(puzzle.domain, next)) {
                // Dead end for whatever was buffered. In digit mode it's already
                // showing (applied live as it was typed) — nothing to flush, just
                // start over. In note mode nothing's been toggled yet, so resolve
                // it now before starting over with this digit.
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

        // Finishes whatever's still buffered when the player does something
        // else entirely (moves the cursor, erases, switches mode...) rather
        // than leaving it to resolve on its own timer. Digit mode has already
        // applied it live, so there's nothing left to do but drop the buffer;
        // note mode hasn't toggled anything yet, so it needs resolving now.
        const flushBuffer = () => {
            if (session.inputMode === "digit") resetBuffer();
            else resolveNoteBuffer();
        };

        // Anything that changes the board other than our own live-applied
        // digit — a NumberPad click, undo/redo — invalidates whatever's still
        // pending, so a stale buffer doesn't extend into a later keystroke and
        // overwrite that other change.
        const unsubscribe = session.subscribe(() => {
            if (applyingOwnChange.current) return;
            resetBuffer();
        });

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

            const isPlainDigit = /^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.shiftKey;
            // Doing anything else commits whatever's still buffered from a
            // part-typed multi-digit value rather than leaving it to land later.
            if (!isPlainDigit) flushBuffer();

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
            // in domains that don't include it, and input()/pushDigit() already
            // no-op on a digit outside the domain, so there's nothing special to
            // do for it.
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
            flushBuffer();
            if (modifierHeld.current) restoreMode();
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        return () => {
            unsubscribe();
            window.clearTimeout(digitTimer.current);
            digitBuffer.current = "";
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        };
    }, [session, puzzle.domain]);

    return session;
};
