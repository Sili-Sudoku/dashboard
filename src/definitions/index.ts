/**
 * The built-in definition registry.
 *
 * This is a plain lookup table passed to `compilePuzzle`. Nothing in
 * `src/runtime` imports it. Adding a variant is: write a function, add a line
 * here. Removing every entry leaves the runtime fully functional for puzzles
 * authored in primitive constraints.
 */

import type { DefinitionRegistry } from "@/definitions/types.ts";
import { sudoku } from "@/definitions/sudoku.ts";
import { thermometer } from "@/definitions/thermometer.ts";
import { killer } from "@/definitions/killer.ts";
import { arrow } from "@/definitions/arrow.ts";

export const definitions: DefinitionRegistry = {
    sudoku,
    thermometer,
    killer,
    arrow,
};

export { sudoku, thermometer, killer, arrow };
export type { ConstraintDefinition, DefinitionRegistry, CompileContext } from "@/definitions/types.ts";
