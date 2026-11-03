# Puzzle format (v1)

A puzzle is one JSON object. It does not depend on React or on the renderer. It
is deterministic and reasonably compact. The top-level `version` field gives
its version. It can be stored in a database row, a file, or a URL.

## Versions and old puzzles

The `version` field is the version of the format that wrote the puzzle. A shared link or a saved file keeps it.
The app reads every older version: when the format changes, a migration function turns version N into version N+1
(`src/runtime/migrations.ts`), so an old link still opens. A puzzle with a newer version than the app reads is
refused with a message to update the app.

`src/runtime/fixtures/v<N>/` holds real puzzles and links of each version. A test opens every one of them.
Never edit or delete a fixture. A change of the format must keep the old fixtures loading.

## Top-level shape

```jsonc
{
  "version": 1,

  "metadata": {
    "id": "demo-mixed",          // required, stable identifier
    "title": "Four Systems, One Grid",
    "author": "…",               // optional
    "description": "…",           // optional
    "difficulty": "medium",       // optional, free text
    "tags": ["sudoku", "killer"]  // optional
  },

  "geometry": { "type": "grid", "width": 9, "height": 9,
                "boxWidth": 3, "boxHeight": 3 },   // box sizes optional; default √

  "domain": { "values": [1,2,3,4,5,6,7,8,9] },     // allowed cell values

  "regions": {                                     // optional named cell groups
    "cage:top-left": ["r1c1", "r1c2", "r1c3"]
  },

  "givens": { "r1c1": 5, "r1c5": 7 },              // optional fixed clues

  "fog": { "hidden": ["r7c7", "r7c8"] },           // optional, requires "solution"

  "rules": [ /* dynamic rules, see "Rules" below */ ],   // optional

  "objects": [ /* visual objects, see below */ ],   // optional

  "constraints": [ /* see below */ ],               // required (may be empty)

  "solution": { "r1c1": 5, /* … */ },              // optional, full grid

  "presentation": { "cellSize": 64 }                // optional renderer hints
}
```

### Cell ids

A grid cell id is `r<row>c<col>`. Numbers start at 1 and run in row-major
order. `r1c1` is the top-left cell.

### Rules

Some things change with the board. A rule has a condition and an effect. The
effect holds while the condition is true.

```jsonc
"rules": [
  { "id": "uncover-bottom",
    "when": ["allDifferent", ["cells", "row:0"]],        // any expression, as in a constraint
    "then": { "reveal": ["row:3"] } }                    // effects, below
]
```

The runtime evaluates `when` on the current board. It uses the same
three-valued logic as constraints. A rule applies only when `when` is
*definitely* true. While a cell that `when` reads is empty, the rule has not
applied yet. All effects are optional:

| effect    | meaning while the rule holds                                                                    |
| --------- | ----------------------------------------------------------------------------------------------- |
| `reveal`  | These cells (ids or region selectors) are visible. Until then they are hidden, as under fog.    |
| `appear`  | These cells (ids or region selectors) are on the board. Until then they are not drawn, cannot be selected, and have no lines around them. The board outline closes around the other cells (a 4×3 board that grows a row). |
| `show`    | These visual objects (by `id`) are drawn. Until then they are not drawn.                        |
| `hide`    | These visual objects are not drawn.                                                             |
| `enable`  | These constraints (by compiled id such as `killer#2`, or by `source`/name) are enforced. Until then they are not enforced. |
| `disable` | These constraints are not enforced.                                                             |

The runtime stores no extra state. Each effect is a function of the current
board. So undo, reload, and share links need no extra state. A rule switches off
again if the board stops satisfying it. At compile time, `enable` and `disable`
become part of the constraint itself (`implies(when, c)` and `or(when, c)`). The
solver and the uniqueness check see them and do not need to know about rules. A
reference that matches nothing is a compile error.

### Fog

`fog.hidden` lists the cells that start hidden. They are revealed step by step
as the player solves correctly. The puzzle must have `solution`, because
"correct" is defined against it. A hidden cell clears in one of two cases:

- The player fills it in correctly.
- An orthogonally adjacent cell holds its correct value *because of the
  player's own progress*.

A given that is there from the start does not count. If it did, every hidden
cell next to a given would reveal at once, with no action from the player.

Fog affects only rendering. It affects what the renderer draws over the given or
clue of a hidden cell, and over any constraint graphics. Constraints evaluate
the real board state, with or without fog. The player's own entry in a cell that
is still hidden stays visible.

A hidden *given* stays editable, like an empty cell, while it is hidden. The
player cannot tell it from a hidden empty cell. So the usual lock on givens does
not apply until the cell is revealed. When the cell is revealed, it locks and
shows the real clue. The runtime discards any guess that the player typed under it.

### Region selectors

A constraint uses a selector string when it needs a group of cells:

| Selector      | Meaning                                  |
|---------------|------------------------------------------|
| `r1c1`        | a single cell                            |
| `row:0`       | geometry row (0-indexed)                 |
| `col:8`       | geometry column                          |
| `box:4`       | geometry box                             |
| `all`         | every cell                               |
| `cage:top-left` | a region that the puzzle names         |
| `["r1c1","r1c2"]` | an explicit list (as a JSON array)   |

### Composite geometry

A composite geometry puts several grids in one coordinate space. Use it for
linked and Samurai sudokus, and for boards with a gap between grids:

```jsonc
"geometry": { "type": "composite", "grids": [
  { "id": "nw", "row": 0, "col": 0,  "width": 9, "height": 9 },
  { "id": "ne", "row": 0, "col": 12, "width": 9, "height": 9 }
] }
```

`row` and `col` give the position of the top-left cell of each grid in the
shared space (from 0). `boxWidth` and `boxHeight` work as they do for a single
grid. Cells keep the `rNcM` names. The numbers count across the whole space, so
a constraint can reach any grid. Grids can overlap, and a shared cell exists
once. Grids can also leave gaps, which have no cells. Each grid has its own
regions, named `nw/row:0`, `nw/col:3`, and `nw/box:4` (plus `all`). A bare `row:0`
does not exist, because it is ambiguous. `sudoku` constrains every grid on its own.

## Constraints

Each entry of `constraints` is **either** a primitive expression **or** a
definition reference.

### Primitive expressions

To give an expression your own name, wrap it:
`{ "rule": ["==", 1, 1], "name": "German whispers" }`. The name replaces
`"primitive"` as the `source` of the constraint. Rules with the same name group
together in the constraint list. Without `name`, the bare array has the same meaning.

An expression is an S-expression that is encoded as a JSON array:
`[operator, ...args]`. Bare numbers and booleans are literals. A bare string has
a meaning only in two places: as the argument of an operator that takes cells
(`value`, `cells`, `region`, `adjacent`), and as the token `"$"` inside a
`count` predicate.

```jsonc
["allDifferent", ["cells", "row:0"]]
["==", ["sum", ["cells", "cage:top-left"]], 12]
["<", ["value", "r1c1"], ["value", "r1c2"]]
["strictIncreasing", ["cells", ["r1c8", "r2c8", "r3c8"]]]
["count", ["cells", "col:0"], [">", "$", 5]]
```

#### Operator reference

| Operator | Args | Result |
|---|---|---|
| `value` | cell | number \| unknown |
| `values` | cells | list of (number \| empty) |
| `cells` / `region` | selector \| list | cells |
| `list` | exprs… | number list |
| `sum` | cells \| list | number (unknown until all cells are filled) |
| `+` `-` `*` | scalars | number |
| `count` | cells, predicate (`$` = value) | number (unknown if any cell is empty) |
| `countValue` | cells, n | number |
| `allDifferent` / `distinct` | cells | bool; false at once on a duplicate |
| `strictIncreasing` / `strictDecreasing` | sequence | bool |
| `increasing` / `decreasing` | sequence | bool (allows equal values) |
| `==` `!=` `<` `<=` `>` `>=` | 2 scalars | bool |
| `and` `or` `not` `implies` | predicates | bool (Kleene 3-valued) |
| `adjacent` | 2 cell ids | bool (constant, from geometry) |

Every constraint evaluates to one of three results:

- **satisfied**: definitely true
- **violated**: definitely false
- **incomplete**: too few cells are filled to decide

A puzzle is `valid` when no constraint is violated. A puzzle is `complete` when
every cell is filled and every constraint is satisfied.

### Definition references

```jsonc
{ "use": "sudoku" }
{ "use": "killer", "cells": ["r1c1","r1c2","r1c3"], "sum": 12 }
{ "use": "thermometer", "cells": ["r1c8","r2c8","r3c8"] }
{ "use": "arrow", "bulb": "r4c9", "cells": ["r4c8","r5c9"] }
{ "use": "kropkiDifference", "cells": ["r1c1","r1c2"], "value": 1 }
{ "use": "kropkiRatio", "cells": ["r1c1","r1c2"], "value": 2 }
{ "use": "odd", "cell": "r1c1" }
{ "use": "even", "cells": ["r1c2","r1c3"] }
```

`compilePuzzle(def, registry)` expands these references against the injected
registry. Each definition returns primitive constraints and, optionally, visual
objects. These are what you can also write by hand. The compiled puzzle contains
only primitives. The `source` of each compiled constraint records which
definition made it (or `"primitive"`).

A definition reference can also restyle what its definition draws, for each
instance. `color` recolors strokes and non-empty fills. `style` sets single
`VisualStyle` properties (`stroke`, `fill`, `strokeWidth`, `dashed`, `opacity`,
`z`) on top of that. The logic of the definition does not change. This is a
presentation choice only. `compilePuzzle` applies it, so no definition needs to
know about it:

```jsonc
{ "use": "thermometer", "cells": ["r1c1","r1c2","r1c3"], "color": "#2c7a4b" }
{ "use": "thermometer", "cells": ["r2c1","r2c2"], "style": { "opacity": 1, "dashed": true } }
```

`style` can also fill filled shapes (circles, rects, polygons, regions) with a
`pattern` or an `image`. The patterns are `stripes`, `dots`, `checks`, and
`crosshatch`. A pattern uses the fill color. An `image` is an `https:`,
`data:image/…`, or site-relative URL. It fits the whole object. Set one of the
two, not both. Anything else is a compile error. So an imported puzzle cannot
make the page load an arbitrary URL scheme.

The built-in definitions are `sudoku`, `thermometer`, `killer`, `arrow`,
`kropkiDifference`, `kropkiRatio`, `odd`, and `even` (`src/definitions/`).

## Interop

`src/interop/fpuzzles.ts` imports and exports the
[f-puzzles](https://www.f-puzzles.com/) JSON format. SudokuPad, Logic Mines,
and Crack The Cuber also use this format. The functions are `importFPuzzles` and
`exportFPuzzles`. Each returns `{ ..., warnings }` or an `Error`. The coverage is
partial on purpose. It covers these types:

- classic sudoku, including jigsaw regions
- givens
- killer cages
- thermometers
- arrows
- kropki dots
- odd and even cells

The code reports anything else in the source as a warning. It does the same for
any puzzle constraint that it cannot represent on export. It never drops them
silently. The f-puzzles import and export icon buttons on the Author page use
these functions.

Sometimes no cell declares a `region`. Then `importFPuzzles` uses the default
(√-based) box size of the grid, if the grid size is a perfect square. A real
exported puzzle had no region data, and still used standard boxes. If the grid
size is not a perfect square, the box size would be the whole grid. In that
case the import drops the box constraint. Both cases give a warning, because
the import guesses. The source can have no boxes, or custom boxes, and absent
data does not show which.

The import buttons on the Author page open a dialog in the app (a `<textarea>`
with Cancel and Import). They do not use `window.prompt`. A browser can let the
user block native dialogs for good after a few of them, and this would break the
feature without a message. A native prompt also has a single-line input, which
is bad for pasting multi-line JSON.

`importFPuzzles` also accepts an f-puzzles.com share link directly. This is the
`?load=<payload>` URL, or only the payload. A real user has this link, not raw
JSON. The payload is compressed with lz-string and encoded in base64. The code
extracts it with a plain regex, not `URLSearchParams`. The payload has literal
`+` characters. They are valid in unencoded base64. Form-urlencoded decoding
would change them to spaces and corrupt the payload. `encodeFPuzzlesShareLink`
does the reverse. The f-puzzles export button on the Author page opens its
result in a new tab. The result is a loadable `https://f-puzzles.com/?load=...`
URL, not raw JSON. A user can load that URL back into the source app.

`src/interop/sudokumaker.ts` does the same for the
[SudokuMaker](https://sudokumaker.app/) JSON format. The functions are
`importSudokuMaker` and `exportSudokuMaker`. They cover the same common types
and use the same `{ ..., warnings }` contract. The SudokuMaker import and export
icon buttons on the Author page use them. The import also accepts these inputs:

- a share link (`?puzzle=<payload>`) that is compressed with raw deflate through `pako`
- a legacy payload that is compressed with lz-string and has an `N` prefix instead of `D`
- the plain uncompressed `.json` export

`encodeSudokuMakerShareLink` does the reverse. It always writes the current
(non-legacy) `D`-prefixed format. It targets the production host `sudokumaker.app`,
not `dev.`. The export button opens this link in a new tab, like the f-puzzles button.

## Visual objects

Visual objects are generic shapes that the renderer can draw. A definition
attaches the ones that it needs. The renderer never switches on "thermometer".

```jsonc
{ "kind": "path",    "cells": ["r1c1","r1c2"], "style": { "stroke": "…" } }
{ "kind": "line",    "points": ["r4c9","r4c8","r5c9"], "arrow": true, "trim": { "start": 0.4, "end": 0.3 } }  // trim: cells cut off each end
{ "kind": "circle",  "at": "r1c1", "r": 0.4 }
{ "kind": "rect",    "at": { "cell": "r1c1", "corner": "tl" }, "w": 1, "h": 1 }
{ "kind": "polygon", "points": [{ "x": 0, "y": 0 }, { "x": 3, "y": 0 }] }
{ "kind": "cage",    "cells": [...], "label": "12" }   // dashed outline of a set
{ "kind": "text",    "at": "r5c5", "text": "!" }
{ "kind": "region",  "cells": [...] }                  // shaded cells
```

A `PointRef` is one of these: a cell id (its centre), `{ cell, corner }`, or
`{ x, y }` in grid units.

## Transport

`encodePuzzle(def)` returns `<codec><base64url(JSON)>`. `decodePuzzle` does the
reverse and validates again. Codec `1` is raw base64url JSON. `parsePuzzle` does
a shallow structural check of untrusted input. `compilePuzzle` does the deep
checks. It never throws. It returns an `Error` instead.
