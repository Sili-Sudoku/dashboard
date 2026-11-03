/**
 * The format of what the app keeps in localStorage: progress, pen, stats and settings.
 * Each blob is `{ v, data }`. A change to the shape of `data` raises `version` and adds a migration, so a
 * save of an older app still opens. A save without `v` is version 0: it is the plain data of the first release.
 * (Theme and palette are single words, with no shape to change, so they have no version.)
 */

export interface SavedFormat {
    version: number;
    /** `migrations[n]` turns the data of version n into the data of version n + 1. */
    migrations: Readonly<Record<number, (data: unknown) => unknown>>;
}

/** Version 0 has the same data as version 1. Only the wrapper is new. */
const addVersionField = (data: unknown): unknown => data;

const format = (): SavedFormat => ({ version: 1, migrations: { 0: addVersionField } });

export const PROGRESS_FORMAT = format();
export const PEN_FORMAT = format();
export const STATS_FORMAT = format();
export const SETTINGS_FORMAT = format();

export const encodeSaved = (data: unknown, { version }: SavedFormat): string => JSON.stringify({ v: version, data });

/**
 * The data of a saved blob, migrated to the current version.
 * It gives `undefined` for a save of a newer app (the data may not fit) or a gap in the migrations.
 * It throws for text that is not JSON, so callers keep their existing `catch`.
 */
export const decodeSaved = (raw: string, { version, migrations }: SavedFormat): unknown => {
    const parsed: unknown = JSON.parse(raw);
    let from = 0;
    let data: unknown = parsed;
    if (typeof parsed === "object" && parsed !== null && "v" in parsed && "data" in parsed) {
        if (typeof parsed.v !== "number") return undefined;
        from = parsed.v;
        data = parsed.data;
    }
    if (!Number.isInteger(from) || from < 0 || from > version) return undefined;
    for (; from < version; from++) {
        const migrate = migrations[from];
        if (!migrate) return undefined;
        data = migrate(data);
    }
    return data;
};
