/**
 * The development puzzle registry: a plain map of id -> artifact. This stands in
 * for a future database or content service. `/p/<id>` resolves here; `/p/<blob>`
 * decodes an artifact straight from the URL.
 */

import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import { classicSudoku } from "@/puzzles/classic_sudoku.ts";
import { miniSudoku } from "@/puzzles/mini_sudoku.ts";
import { demoMixed } from "@/puzzles/demo_mixed.ts";
import { whisperLinePuzzle } from "@/puzzles/whisper_line.ts";
import { largeDemo } from "@/puzzles/large_demo.ts";

export const puzzleRegistry: Readonly<Record<string, PuzzleDefinition>> = {
    [demoMixed.metadata.id]: demoMixed,
    [whisperLinePuzzle.metadata.id]: whisperLinePuzzle,
    [classicSudoku.metadata.id]: classicSudoku,
    [miniSudoku.metadata.id]: miniSudoku,
    [largeDemo.metadata.id]: largeDemo,
};

export const listPuzzles = (): readonly PuzzleDefinition[] => Object.values(puzzleRegistry);

export const getPuzzle = (id: string): PuzzleDefinition | undefined => puzzleRegistry[id];

export { classicSudoku, miniSudoku, demoMixed, whisperLinePuzzle, largeDemo };
