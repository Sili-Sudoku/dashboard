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
import { largeDemo0, largeDemo30, largeDemo50, largeDemo70 } from "@/puzzles/large_demo_density.ts";
import { fogDemo } from "@/puzzles/fog_demo.ts";

export const puzzleRegistry: Readonly<Record<string, PuzzleDefinition>> = {
    [demoMixed.metadata.id]: demoMixed,
    [whisperLinePuzzle.metadata.id]: whisperLinePuzzle,
    [classicSudoku.metadata.id]: classicSudoku,
    [miniSudoku.metadata.id]: miniSudoku,
    [largeDemo.metadata.id]: largeDemo,
    [largeDemo0.metadata.id]: largeDemo0,
    [largeDemo30.metadata.id]: largeDemo30,
    [largeDemo50.metadata.id]: largeDemo50,
    [largeDemo70.metadata.id]: largeDemo70,
    [fogDemo.metadata.id]: fogDemo,
};

export const listPuzzles = (): readonly PuzzleDefinition[] => Object.values(puzzleRegistry);

export const getPuzzle = (id: string): PuzzleDefinition | undefined => puzzleRegistry[id];

export {
    classicSudoku,
    miniSudoku,
    demoMixed,
    whisperLinePuzzle,
    largeDemo,
    largeDemo0,
    largeDemo30,
    largeDemo50,
    largeDemo70,
    fogDemo,
};
