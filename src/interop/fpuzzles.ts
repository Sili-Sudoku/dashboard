/**
 * f-puzzles JSON interop (import/export). SudokuPad, Logic Mines and Crack The Cuber use the same JSON.
 * This adapter is isolated: nothing in `src/runtime` or `src/definitions` knows the format exists.
 *
 * The shape comes from community documentation. The sandbox has no route to f-puzzles.com,
 * so the live spec is not checked. Test an import with a real exported file.
 *
 * Covers: classic sudoku (jigsaw regions, diagonals), givens, killer cages and little killer sums, thermometers,
 * arrows, kropki dots, xv, odd/even and minimum/maximum markers, palindrome/between lines, clones, quadruples,
 * sandwich sums, the antiknight/antiking/nonconsecutive/disjointgroups flags, and the "negative" flags.
 * The importer warns about any other data, or a clue whose cells do not resolve. It never drops data silently.
 *
 * sandwichsum and littlekillersum are not a list of resolved cells. Each has one anchor cell just
 * *outside* the grid (for example "R0C4" is above column 4), and littlekillersum has a `direction`
 * ("UL"/"UR"/"DL"/"DR") for the diagonal that runs back in. A real f-puzzles crash showed this.
 * See `outsideCellCoords`, `sandwichAnchor` and `littleKillerAnchor`.
 */

export * from "@/interop/fpuzzles_format.ts";
export { importFPuzzles } from "@/interop/fpuzzles_import.ts";
export { exportFPuzzles, encodeFPuzzlesShareLink, encodeSudokuPadShareLink } from "@/interop/fpuzzles_export.ts";
