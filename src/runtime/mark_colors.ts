/**
 * The colour-marking palette (#35): what the "color" input mode paints cells
 * with. Cells store a *palette index*, not a colour, so a player's customised
 * palette (kept in Settings, shared by every puzzle) recolours existing marks
 * instead of orphaning them.
 *
 * Chosen by search, not by eye: nine light colours that keep dark digits
 * readable (>= 7:1 against the ink colour) and stay mutually distinguishable
 * under normal vision and protan/deutan/tritan simulation (Machado 2009) — the
 * smallest pairwise CIELAB difference across all four is ~15, versus ~2.5 for
 * a typical hand-picked pastel set. Order is hue order, so key 1..9 maps along
 * the spectrum.
 */
export const DEFAULT_MARK_COLORS: readonly string[] = [
    "#f4c7c2",
    "#d69d85",
    "#f4f4c2",
    "#cbf764",
    "#81f88d",
    "#bbfbf5",
    "#d1c2f4",
    "#e181f8",
    "#f881b1",
];

/** Customisable slots (keys 1-9). */
export const CUSTOM_COLOR_COUNT = DEFAULT_MARK_COLORS.length;

/**
 * A tenth, fixed mark: the board's own background (key 0). It's a real mark, not
 * "no colour" — paired with another colour it splits the cell (colour + background),
 * the usual way to show "this cell is one of two candidates, the other unknown" on
 * a pair of cells. Resolved through the theme, so it's always exactly the paper
 * colour in light and dark, and isn't part of the editable palette.
 */
export const BACKGROUND_MARK_INDEX = CUSTOM_COLOR_COUNT;
export const BACKGROUND_MARK_COLOR = "var(--surface)";
export const MARK_COLOR_COUNT = CUSTOM_COLOR_COUNT + 1;

/** Palette index for a pad/keyboard digit in colour mode (1-9 -> 0-8, 0 -> background); undefined for anything else. */
export const markIndexForDigit = (digit: number): number | undefined =>
    digit === 0 ? BACKGROUND_MARK_INDEX : Number.isInteger(digit) && digit >= 1 && digit <= CUSTOM_COLOR_COUNT ? digit - 1 : undefined;

/** The colour to paint mark `index` with, or undefined for an index outside the palette. */
export const resolveMarkColor = (palette: readonly string[], index: number): string | undefined =>
    index === BACKGROUND_MARK_INDEX ? BACKGROUND_MARK_COLOR : palette[index];

const HEX = /^#[0-9a-f]{6}$/i;

/** A saved palette is trusted only if it's exactly one valid #rrggbb per slot; anything else falls back to the default. */
export const sanitizePalette = (value: unknown): readonly string[] =>
    Array.isArray(value) && value.length === CUSTOM_COLOR_COUNT && value.every((c) => typeof c === "string" && HEX.test(c))
        ? (value as string[])
        : DEFAULT_MARK_COLORS;
