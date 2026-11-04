/**
 * The development puzzle registry: a plain map of id -> artifact. It stands in
 * for a future database or content service. `/p/<id>` resolves here. `/p/<blob>`
 * decodes an artifact straight from the URL.
 */

import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import { classicSudoku } from "@/puzzles/classic_sudoku.ts";
import { miniSudoku } from "@/puzzles/mini_sudoku.ts";
import { firstPuzzle } from "@/puzzles/first_puzzle.ts";
import { demoMixed } from "@/puzzles/demo_mixed.ts";
import { whisperLinePuzzle } from "@/puzzles/whisper_line.ts";
import { largeDemo } from "@/puzzles/large_demo.ts";
import { largeDemo0, largeDemo30, largeDemo50, largeDemo70 } from "@/puzzles/large_demo_density.ts";
import { fogDemo } from "@/puzzles/fog_demo.ts";
import { rulesDemo } from "@/puzzles/rules_demo.ts";
import { samuraiSudoku } from "@/puzzles/samurai.ts";

export const puzzleRegistry: Readonly<Record<string, PuzzleDefinition>> = {
    [firstPuzzle.metadata.id]: firstPuzzle,
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
    [samuraiSudoku.metadata.id]: samuraiSudoku,
    [rulesDemo.metadata.id]: rulesDemo,
};

/**
 * Puzzles that exist to test and measure the app, not to be played for fun: the large boards (the size and density
 * ones are for performance work), the rules demo, and the primitive-only puzzle (it proves that the runtime does not
 * need the definitions, and it has more than one solution). They still open at `/p/<id>`, and the Author page
 * offers them as examples. The public puzzle list leaves them out. In development the list shows them apart.
 */
const FIXTURE_IDS: ReadonlySet<string> = new Set(
    [largeDemo, largeDemo0, largeDemo30, largeDemo50, largeDemo70, rulesDemo, miniSudoku].map((p) => p.metadata.id),
);

/** Every built-in puzzle, fixtures included. */
export const listAllPuzzles = (): readonly PuzzleDefinition[] => Object.values(puzzleRegistry);

/** The puzzles the public list shows. */
export const listPuzzles = (): readonly PuzzleDefinition[] =>
    listAllPuzzles().filter((p) => !FIXTURE_IDS.has(p.metadata.id));

/** The puzzles that exist to test the app. */
export const listFixtures = (): readonly PuzzleDefinition[] =>
    listAllPuzzles().filter((p) => FIXTURE_IDS.has(p.metadata.id));

export const getPuzzle = (id: string): PuzzleDefinition | undefined => puzzleRegistry[id];

export {
    firstPuzzle,
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
    samuraiSudoku,
    rulesDemo,
};
