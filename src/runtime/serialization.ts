/**
 * Puzzle artifact <-> transport.
 *
 * `parsePuzzle` does a shallow structural validation of untrusted JSON.
 * `compilePuzzle` does the deep checks.
 * `encodePuzzle` / `decodePuzzle` make a URL-safe string, so a puzzle can travel in `/p/<encoded>` with no server.
 *
 * The encoded form is `<codec><payload>`. Codec "1" is base64url(JSON).
 * A compressed codec added later is a new leading character. It is not a breaking change.
 */

import { migratePuzzle } from "@/runtime/migrations.ts";
import { type ConstraintSpec, type PuzzleDefinition } from "@/runtime/puzzle.ts";

// --- limits ---------------------------------------------------------------

/** Size limits for data that comes from outside: a shared link, a pasted puzzle, an import.
 *  Without them, a small crafted payload can freeze the tab. A real puzzle is far below every limit. */
export const LIMITS = {
    /** The text of a puzzle as JSON. The large demo (25x25) is about 100 KB. */
    jsonChars: 2_000_000,
    /** An encoded share link (`/p/<encoded>`) or a raw-deflate payload. */
    encodedChars: 400_000,
    /** The output of an inflate. Checked while it runs, so a decompression bomb stops early. */
    inflatedBytes: 4_000_000,
    /** An lz-string payload. lz-string cannot stop early, and its output can grow with the square of its input.
     *  So the input limit is small. A real f-puzzles link has a few thousand characters. */
    lzInputChars: 20_000,
    /** The cells of all the grids of a puzzle. */
    cells: 10_000,
    /** The free-text fields of `metadata`, in characters. The app shows them as plain text, never as HTML. */
    id: 100,
    title: 200,
    author: 100,
    description: 10_000,
    difficulty: 50,
    tag: 50,
    tags: 30,
} as const;

// --- validation -----------------------------------------------------------

export const parsePuzzle = (input: unknown): PuzzleDefinition | Error => {
    let data: unknown = input;
    if (typeof input === "string") {
        if (input.length > LIMITS.jsonChars) {
            return new Error(`the puzzle text is too long (more than ${LIMITS.jsonChars} characters)`);
        }
        try {
            data = JSON.parse(input);
        } catch (err) {
            return new Error(`invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    if (typeof data !== "object" || data === null) return new Error("puzzle must be an object");
    // A puzzle file of an older version is brought to the current version first (see migrations.ts).
    const migrated = migratePuzzle(data as Record<string, unknown>);
    if (migrated instanceof Error) return migrated;
    data = migrated;
    const obj = migrated;

    const metadata = obj.metadata;
    if (typeof metadata !== "object" || metadata === null) return new Error("metadata is required");
    const meta = metadata as Record<string, unknown>;
    if (typeof meta.id !== "string" || meta.id.length === 0) return new Error("metadata.id is required");
    if (typeof meta.title !== "string" || meta.title.length === 0) return new Error("metadata.title is required");
    const metadataError = checkMetadataText(meta);
    if (metadataError) return metadataError;

    const geometry = obj.geometry as Record<string, unknown> | undefined;
    if (!geometry || (geometry.type !== "grid" && geometry.type !== "composite")) {
        return new Error('geometry.type must be "grid" or "composite"');
    }
    if (geometry.type === "grid") {
        if (!isPositiveInt(geometry.width) || !isPositiveInt(geometry.height)) {
            return new Error("geometry.width and geometry.height must be positive integers");
        }
    } else {
        const grids = geometry.grids;
        if (!Array.isArray(grids) || grids.length === 0) return new Error("geometry.grids must be a non-empty array");
        for (const g of grids as Record<string, unknown>[]) {
            if (typeof g !== "object" || g === null || !isPositiveInt(g.width) || !isPositiveInt(g.height)) {
                return new Error("each geometry grid needs a positive integer width and height");
            }
            if (!isNonNegativeInt(g.row) || !isNonNegativeInt(g.col)) {
                return new Error("each geometry grid needs a row and col offset (integers from 0)");
            }
        }
    }

    const cellCount =
        geometry.type === "grid"
            ? (geometry.width as number) * (geometry.height as number)
            : (geometry.grids as { width: number; height: number }[]).reduce((n, g) => n + g.width * g.height, 0);
    if (cellCount > LIMITS.cells) {
        return new Error(`the puzzle has too many cells (${cellCount}, the limit is ${LIMITS.cells})`);
    }

    const domain = obj.domain as Record<string, unknown> | undefined;
    if (!domain || !Array.isArray(domain.values) || domain.values.length === 0) {
        return new Error("domain.values must be a non-empty array");
    }
    if (!domain.values.every((v) => typeof v === "number" && Number.isFinite(v))) {
        return new Error("domain.values must contain only numbers");
    }

    if (!Array.isArray(obj.constraints)) return new Error("constraints must be an array");
    for (const spec of obj.constraints as unknown[]) {
        if (!isConstraintSpecShape(spec)) {
            return new Error("each constraint must be an expression array, a { use } object or a { rule } object");
        }
    }

    if (obj.rules !== undefined) {
        if (!Array.isArray(obj.rules)) return new Error("rules must be an array");
        for (const rule of obj.rules as unknown[]) {
            const r = rule as { when?: unknown; then?: Record<string, unknown> } | null;
            if (
                typeof r !== "object" ||
                r === null ||
                !Array.isArray(r.when) ||
                typeof r.then !== "object" ||
                r.then === null
            ) {
                return new Error('each rule needs a "when" expression and a "then" object');
            }
            const known = ["reveal", "appear", "show", "hide", "enable", "disable"];
            for (const [key, refs] of Object.entries(r.then)) {
                if (!known.includes(key))
                    return new Error(`unknown rule effect "${key}" (expected ${known.join(", ")})`);
                if (!Array.isArray(refs) || !refs.every((x) => typeof x === "string")) {
                    return new Error(`rule effect "${key}" must be an array of strings`);
                }
            }
        }
    }

    if (obj.givens !== undefined && !isRecordOfNumbers(obj.givens)) {
        return new Error("givens must be a map of cell -> number");
    }
    if (obj.regions !== undefined && !isRecordOfStringArrays(obj.regions)) {
        return new Error("regions must be a map of name -> cell id array");
    }
    if (obj.objects !== undefined && !Array.isArray(obj.objects)) {
        return new Error("objects must be an array");
    }

    return data as PuzzleDefinition;
};

const isNonNegativeInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
/** The free-text fields must be strings (the page shows them as text) and must not be longer than the limit. */
const checkMetadataText = (meta: Record<string, unknown>): Error | undefined => {
    const fields = ["id", "title", "author", "description", "difficulty"] as const;
    for (const field of fields) {
        const value = meta[field];
        if (value === undefined) continue;
        if (typeof value !== "string") return new Error(`metadata.${field} must be a string`);
        if (value.length > LIMITS[field]) {
            return new Error(
                `metadata.${field} is too long (${value.length} characters, the limit is ${LIMITS[field]})`,
            );
        }
    }
    const tags = meta.tags;
    if (tags === undefined) return undefined;
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string")) {
        return new Error("metadata.tags must be an array of strings");
    }
    if (tags.length > LIMITS.tags) return new Error(`metadata.tags has too many tags (the limit is ${LIMITS.tags})`);
    if (tags.some((t: string) => t.length > LIMITS.tag)) {
        return new Error(`a tag in metadata.tags is too long (the limit is ${LIMITS.tag} characters)`);
    }
    return undefined;
};

const isPositiveInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

const isConstraintSpecShape = (spec: unknown): spec is ConstraintSpec => {
    if (Array.isArray(spec)) return spec.length > 0;
    if (typeof spec === "object" && spec !== null) {
        const o = spec as Record<string, unknown>;
        if (typeof o.use === "string") return true;
        // A named rule: { rule: [...], name?: "..." }
        return Array.isArray(o.rule) && o.rule.length > 0 && (o.name === undefined || typeof o.name === "string");
    }
    return false;
};

const isRecordOfNumbers = (v: unknown): boolean =>
    typeof v === "object" && v !== null && Object.values(v).every((x) => typeof x === "number");

const isRecordOfStringArrays = (v: unknown): boolean =>
    typeof v === "object" &&
    v !== null &&
    Object.values(v).every((x) => Array.isArray(x) && x.every((c) => typeof c === "string"));

// --- transport ----------------------------------------------------------

const CODEC_BASE64_JSON = "1";

export const encodePuzzle = (def: PuzzleDefinition): string => {
    const json = JSON.stringify(def);
    return CODEC_BASE64_JSON + toBase64Url(new TextEncoder().encode(json));
};

export const decodePuzzle = (encoded: string): PuzzleDefinition | Error => {
    if (encoded.length < 2) return new Error("encoded puzzle is too short");
    if (encoded.length > LIMITS.encodedChars) return new Error("encoded puzzle is too long");
    const codec = encoded[0];
    const payload = encoded.slice(1);
    if (codec !== CODEC_BASE64_JSON) return new Error(`unknown puzzle codec "${codec}"`);
    try {
        const json = new TextDecoder().decode(fromBase64Url(payload));
        return parsePuzzle(json);
    } catch (err) {
        return new Error(`cannot decode puzzle:  ${err instanceof Error ? err.message : String(err)}`);
    }
};

const toBase64Url = (bytes: Uint8Array): string => {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value: string): Uint8Array => {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};
