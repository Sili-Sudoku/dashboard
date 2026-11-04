/** The plain types and storage keys of `PuzzleSession`. They carry no logic. */

import type { CellId } from "@/runtime/geometry.ts";
import type { PenState } from "@/runtime/pen.ts";

export interface CellState {
    value: number | null;
    /** Corner notes: shown as a fixed grid with one position for each digit. */
    notes: readonly number[];
    /** Centre (candidate) notes: shown as a compact list that grows. */
    centerNotes: readonly number[];
    /** Colour marks: palette indices, ascending. This layer is independent. Digits and notes never change it. */
    colors: readonly number[];
}

/** Compact, serialisable player progress (entered cells only). */
export type ProgressSnapshot = Readonly<
    Record<
        CellId,
        { value?: number; notes?: readonly number[]; centerNotes?: readonly number[]; colors?: readonly number[] }
    >
>;

export type SelectMode = "replace" | "add" | "toggle";

export interface SessionOptions {
    onChange?: () => void;
    initialProgress?: ProgressSnapshot;
    /** Sets the start value of `checkNotesOnLeave` (default false). The default for the player is in Settings. */
    checkNotesOnLeave?: boolean;
    /** The saved pen layer. It is separate from `initialProgress`, whose keys are cells. */
    initialPen?: PenState;
}

export type InputMode = "digit" | "corner" | "center" | "color" | "pen";

/**
 * Result of `PuzzleSession.checkAgainstSolution`:
 * - "clean": no mistakes.
 * - "mistake-value": a placed value does not match the solution. This is the first press since the board changed,
 *   so it does not say where. It has priority over "mistake-notes", because a wrong digit is the more useful problem.
 * - "mistake-notes": no placed value is wrong, but a centre note removed the correct digit somewhere.
 *   It does not say where either.
 * - "revealed": a second press in a row (no edit between). `incorrectCells` and `flaggedCells` now highlight them.
 */
export type CheckOutcome = "clean" | "mistake-value" | "mistake-notes" | "revealed";

export const penStorageKey = (puzzleId: string): string => `cpr:pen:${puzzleId}`;

export const progressStorageKey = (puzzleId: string): string => `cpr:progress:${puzzleId}`;

/** Local solve-timer stats for each puzzle. They are not community
 *  leaderboards (those need accounts and a backend).
 *  They only show how long a solve took on this device. */
export interface PuzzleStats {
    /** The total active solve time of the current attempt, in ms. */
    elapsedMs: number;
    /** The fastest *completed* solve recorded for this puzzle, in ms.
     *  It stays across resets and retries. It can only become lower. */
    bestElapsedMs?: number;
}

export const statsStorageKey = (puzzleId: string): string => `cpr:stats:${puzzleId}`;
