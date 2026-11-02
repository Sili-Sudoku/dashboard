/**
 * Samurai Sudoku: five 9x9 grids in one 21x21 space.
 * Each of the four corner grids shares a 3x3 box with the centre grid.
 * It shows the composite geometry. Each grid brings its own rows, columns and boxes.
 * So `{ use: "sudoku" }` constrains all five grids and needs no cell positions.
 * Each shared box is made of single cells that belong to both grids.
 */

import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import { givensFromRows } from "@/puzzles/grid_text.ts";

/** 21 columns by 21 rows of the shared space. "." is a cell that is not there (or no given). */
const SOLUTION = [
    "123456789...351246789",
    "456789123...672589134",
    "789123456...984137256",
    "231674895...413752968",
    "875912364...725968341",
    "694538217...896413572",
    "317265948123567821493",
    "542897631579248395617",
    "968341572468139674825",
    "......126754893......",
    "......357982416......",
    "......489316725......",
    "346789215697384125679",
    "589124763841952678134",
    "127356894235671349258",
    "251863479...127463895",
    "763495182...468592317",
    "894217356...539781426",
    "415638927...216857943",
    "632971548...743916582",
    "978542631...895234761",
];

const GIVENS = [
    "123.56..9....51.46789",
    "..67891.3....7258...4",
    "789123.5....984137.56",
    "231674895...413752.68",
    ".75912364...725968341",
    ".945.821....89641357.",
    "317.6.9481.3.67.21.93",
    "5..897631.792483..617",
    ".6834.57246.1.9674825",
    "......1.67.48.3......",
    "......35798241.......",
    "......489316725......",
    ".4.789215697384.25679",
    "5.9124.638419526781.4",
    ".273568.42.5.7....258",
    "251.6..79...127463.9.",
    "7.3495182...46859.31.",
    "..42173.6...539.8.426",
    "4156389.....2168.7943",
    "63.97..48...7.39.658.",
    "..8542.31....9523476.",
];

export const samuraiSudoku: PuzzleDefinition = {
    version: 1,
    metadata: {
        id: "samurai",
        title: "Samurai Sudoku",
        author: "runtime demo",
        description:
            "Five 9x9 grids. Four grids share corner boxes with the center grid. The puzzle uses the composite geometry and has one solution.",
        difficulty: "easy",
        tags: ["sudoku", "samurai", "composite-geometry"],
    },
    geometry: {
        type: "composite",
        grids: [
            { id: "nw", row: 0, col: 0, width: 9, height: 9 },
            { id: "ne", row: 0, col: 12, width: 9, height: 9 },
            { id: "mid", row: 6, col: 6, width: 9, height: 9 },
            { id: "sw", row: 12, col: 0, width: 9, height: 9 },
            { id: "se", row: 12, col: 12, width: 9, height: 9 },
        ],
    },
    domain: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    givens: givensFromRows(GIVENS),
    solution: givensFromRows(SOLUTION),
    constraints: [{ use: "sudoku" }],
    presentation: { cellSize: 40 },
};
