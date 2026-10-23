# Puzzle format (v1)

A puzzle is a single JSON object. It is independent of React and of the
renderer, deterministic, reasonably compact, and versioned by the top-level
`version` field. It can live in a database row, a file, or a URL.

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

  "objects": [ /* visual objects, see below */ ],   // optional

  "constraints": [ /* see below */ ],               // required (may be empty)

  "solution": { "r1c1": 5, /* … */ },              // optional, full grid

  "presentation": { "cellSize": 64 }                // optional renderer hints
}
```

### Cell ids

Grid cells are `r<row>c<col>`, 1-indexed, row-major. `r1c1` is top-left.

### Region selectors

Anywhere a constraint wants a group of cells it uses a selector string:

| Selector      | Meaning                                  |
|---------------|------------------------------------------|
| `r1c1`        | a single cell                            |
| `row:0`       | geometry row (0-indexed)                 |
| `col:8`       | geometry column                          |
| `box:4`       | geometry box                             |
| `all`         | every cell                               |
| `cage:top-left` | a puzzle-defined named region           |
| `["r1c1","r1c2"]` | an explicit list (as a JSON array)   |

## Constraints

Each entry of `constraints` is **either** a primitive expression **or** a
definition reference.

### Primitive expressions

An S-expression encoded as a JSON array: `[operator, ...args]`. Bare numbers and
booleans are literals. Bare strings are only meaningful as the argument of a
cell-shaped operator (`value`, `cells`, `region`, `adjacent`) or the token `"$"`
inside a `count` predicate.

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
| `sum` | cells \| list | number (unknown until all filled) |
| `+` `-` `*` | scalars | number |
| `count` | cells, predicate (`$` = value) | number (unknown if any empty) |
| `countValue` | cells, n | number |
| `allDifferent` / `distinct` | cells | bool — false on a duplicate immediately |
| `strictIncreasing` / `strictDecreasing` | sequence | bool |
| `increasing` / `decreasing` | sequence | bool (allows equal) |
| `==` `!=` `<` `<=` `>` `>=` | 2 scalars | bool |
| `and` `or` `not` `implies` | predicates | bool (Kleene 3-valued) |
| `adjacent` | 2 cell ids | bool (constant, from geometry) |

Every constraint evaluates to **satisfied** (definitely true), **violated**
(definitely false), or **incomplete** (not enough cells filled to decide). A
puzzle is `valid` when nothing is violated and `complete` when every cell is
filled and every constraint is satisfied.

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

`compilePuzzle(def, registry)` expands these against the injected registry. Each
definition returns primitive constraints (and optional visual objects) — exactly
what you could have written by hand. The compiled puzzle contains only
primitives; `source` on each compiled constraint records which definition (or
`"primitive"`) produced it.

Built-in definitions: `sudoku`, `thermometer`, `killer`, `arrow`,
`kropkiDifference`, `kropkiRatio`, `odd`, `even` (`src/definitions/`).

## Interop

`src/interop/fpuzzles.ts` imports and exports the
[f-puzzles](https://www.f-puzzles.com/) JSON format used across the
SudokuPad/Logic Mines/Crack The Cuber ecosystem — `importFPuzzles`/
`exportFPuzzles`, both returning `{ ..., warnings }` or an `Error`. Coverage is
intentionally partial (classic sudoku including jigsaw regions, givens, killer
cages, thermometers, arrows, kropki dots, odd/even); anything else in the
source, or any puzzle constraint it can't represent on export, is reported as a
warning rather than silently dropped. Reachable from the Author page's
"Import from f-puzzles…" / "Export to f-puzzles" buttons.

When no cell declares a `region` at all, `importFPuzzles` falls back to the
grid's default (√-based) box size if the grid size is a perfect square — a
real exported puzzle had no region data yet still used standard boxes — and
otherwise (box size would degenerate to the whole grid) drops the box
constraint outright. Either way it's reported as a warning, since it's a
guess: the source may genuinely have no boxes, or genuinely custom ones, with
no way to tell from absent data alone.

`importFPuzzles` also accepts an f-puzzles.com share link directly (the
`?load=<payload>` URL, or just the payload on its own) — that's the artifact a
real user actually has, not raw JSON. The payload is lz-string-compressed and
base64-encoded; it is deliberately extracted with a plain regex rather than
`URLSearchParams`, because the payload's literal `+` characters are valid
unencoded base64 and would otherwise be corrupted into spaces by
form-urlencoded decoding.

## Visual objects

Generic shapes the renderer knows how to draw. Definitions attach whichever they
need; the renderer never switches on "thermometer".

```jsonc
{ "kind": "path",    "cells": ["r1c1","r1c2"], "style": { "stroke": "…" } }
{ "kind": "line",    "points": ["r4c9","r4c8","r5c9"], "arrow": true }
{ "kind": "circle",  "at": "r1c1", "r": 0.4 }
{ "kind": "rect",    "at": { "cell": "r1c1", "corner": "tl" }, "w": 1, "h": 1 }
{ "kind": "polygon", "points": [{ "x": 0, "y": 0 }, { "x": 3, "y": 0 }] }
{ "kind": "cage",    "cells": [...], "label": "12" }   // dashed outline of a set
{ "kind": "text",    "at": "r5c5", "text": "!" }
{ "kind": "region",  "cells": [...] }                  // shaded cells
```

A `PointRef` is a cell id (its centre), `{ cell, corner }`, or `{ x, y }` in
grid units.

## Transport

`encodePuzzle(def)` → `<codec><base64url(JSON)>`; `decodePuzzle` reverses it and
re-validates. Codec `1` is raw base64url JSON. `parsePuzzle` does shallow
structural validation of untrusted input; `compilePuzzle` does the deep checks
and never throws (returns `Error`).
