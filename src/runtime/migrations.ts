/**
 * Old puzzle files must always load.
 *
 * A puzzle file has a `version` (the format version, `PUZZLE_FORMAT_VERSION`). A shared link or a saved file
 * keeps the version that it was made with. When the format changes, add one function here that turns
 * version N into version N+1. `migratePuzzle` applies them in order, so a file of any older version
 * reaches the current version, and the rest of the app knows only the current one.
 *
 * Rules for a change of the format:
 * 1. Raise `PUZZLE_FORMAT_VERSION` and add `MIGRATIONS[<old version>]`. The function must not change its input.
 * 2. Add a file of the old format to `src/runtime/fixtures/`. Never edit or delete a fixture: the test
 *    `fixtures.test.ts` loads every one of them.
 */

import { PUZZLE_FORMAT_VERSION } from "@/runtime/puzzle.ts";

/** Turns a puzzle of version N into a puzzle of version N+1. */
export type Migration = (puzzle: Record<string, unknown>) => Record<string, unknown>;

/** `MIGRATIONS[n]` migrates from version n to n + 1. There is none yet: version 1 is the first. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export const migratePuzzle = (
    puzzle: Record<string, unknown>,
    migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
    current: number = PUZZLE_FORMAT_VERSION,
): Record<string, unknown> | Error => {
    const start = puzzle.version;
    if (typeof start !== "number" || !Number.isInteger(start) || start < 1) {
        return new Error(`unsupported puzzle format version: ${JSON.stringify(start)}`);
    }
    if (start > current) {
        return new Error(
            `this puzzle has format version ${start}, and this app reads up to version ${current}. Update the app to open it`,
        );
    }
    let result = puzzle;
    for (let version = start; version < current; version++) {
        const migrate = migrations[version];
        if (!migrate) return new Error(`cannot open a puzzle of format version ${start}: no migration from ${version}`);
        result = { ...migrate(result), version: version + 1 };
    }
    return result;
};
