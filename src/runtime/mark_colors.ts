/**
 * The colour-marking palette (#35). The "color" input mode paints cells with it.
 * Cells store a *palette index*, not a colour.
 * Thus a changed palette (kept in Settings, shared by all puzzles) recolours existing marks.
 * The marks do not become orphaned.
 *
 * A search chose the colors, not the eye. There are nine light colours.
 * Dark digits stay readable on them (>= 7:1 against the ink colour).
 * The colours stay different from each other under normal vision
 * and under protan/deutan/tritan simulation (Machado 2009).
 * The smallest pairwise CIELAB difference across all four is about 15.
 * A typical hand-picked pastel set gives about 2.5.
 * The order is hue order, so keys 1 to 9 follow the spectrum.
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

/** Slots that the player can change (keys 1-9). */
export const CUSTOM_COLOR_COUNT = DEFAULT_MARK_COLORS.length;

/**
 * A tenth, fixed mark: the background of the board (key 0).
 * It is a real mark, not "no colour".
 * With another colour, it splits the cell (colour + background).
 * This is the usual way to show that a cell is one of two candidates and the other is unknown.
 * The theme resolves it, so it is always the paper colour in light and dark.
 * It is not part of the editable palette.
 */
export const BACKGROUND_MARK_INDEX = CUSTOM_COLOR_COUNT;
export const BACKGROUND_MARK_COLOR = "var(--surface)";
export const MARK_COLOR_COUNT = CUSTOM_COLOR_COUNT + 1;

/** Palette index for a pad or keyboard digit in colour mode (1-9 -> 0-8, 0 -> background). Else undefined. */
export const markIndexForDigit = (digit: number): number | undefined =>
    digit === 0 ? BACKGROUND_MARK_INDEX : Number.isInteger(digit) && digit >= 1 && digit <= CUSTOM_COLOR_COUNT ? digit - 1 : undefined;

/** The colour for mark `index`. An index outside the palette gives undefined. */
export const resolveMarkColor = (palette: readonly string[], index: number): string | undefined =>
    index === BACKGROUND_MARK_INDEX ? BACKGROUND_MARK_COLOR : palette[index];

const HEX = /^#[0-9a-f]{6}$/i;

/** A saved palette is valid only if it has exactly one valid #rrggbb per slot. Else the default is used. */
export const sanitizePalette = (value: unknown): readonly string[] =>
    Array.isArray(value) && value.length === CUSTOM_COLOR_COUNT && value.every((c) => typeof c === "string" && HEX.test(c))
        ? (value as string[])
        : DEFAULT_MARK_COLORS;
