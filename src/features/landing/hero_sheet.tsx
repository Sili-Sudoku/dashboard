import { definitions } from "@/definitions/index.ts";
import { firstPuzzle } from "@/puzzles/first_puzzle.ts";
import { THUMBNAIL_PALETTE, renderThumbnailSvg } from "@/renderer/thumbnail.ts";
import { compilePuzzle } from "@/runtime/compile.ts";

/** Keeps every `var(--token)` as it is, so the drawing follows the theme of the page (the PNG thumbnail does not). */
const LIVE_PALETTE = Object.fromEntries(Object.keys(THUMBNAIL_PALETTE).map((name) => [name, `var(--${name})`]));

const compiled = compilePuzzle(firstPuzzle, definitions);
const markup = compiled instanceof Error ? "" : renderThumbnailSvg(compiled, LIVE_PALETTE);

/** The drawing on the first screen: the sample puzzle (`/p/first-puzzle`), drawn by the same code as the real board. */
export default function HeroSheet() {
    // The markup comes from our own renderer for a fixed puzzle. It has no user input.
    return <div className="lp-sheet lp-sheet-front lp-board-print" dangerouslySetInnerHTML={{ __html: markup }} />;
}
