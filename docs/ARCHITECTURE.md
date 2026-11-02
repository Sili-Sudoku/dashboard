# Architecture decisions

This project tests one thesis: **a generic constraint runtime can represent and
play a useful set of Sudoku variants. Hardcoded variant implementations are not
necessary.** Every decision below supports this thesis.

## 1. The engine has no variant vocabulary

`src/runtime/operators.ts` is the *entire* vocabulary of the engine. It has:

- grouping: `cells`, `value`, `values`
- arithmetic: `sum`, `+`, `-`, `*`
- counting: `count`, `countValue`
- grouping predicates: `allDifferent`
- ordering: `strictIncreasing` and others
- comparison, Kleene logic, and `adjacent`

A new variant never adds an operator.

There is no `ThermometerConstraint` class and no `variant === "thermo"` branch.
Search for the variant names outside `src/definitions/` and `src/puzzles/`. You
find only the labels in the constraint panel.

## 2. Constraints are data (a tiny Lisp), not a language

Constraints are JSON arrays, for example `["==", ["sum", ["cells", "cage:A"]], 15]`.
This is the smallest form that composes:

- It is serializable and deterministic, because it is JSON.
- It has no parser, no grammar, and no user-defined functions. The one
  "predicate" feature is `$` inside `count`.
- To add an operator, add one entry to a lookup table. The entry is a pure function.

Trade-off: this is not a general programming language, and that is deliberate.
A new constraint that needs control flow needs a new operator or an escape
hatch. The MVP bet is that arithmetic, ordering, counting, set predicates, and
logic cover all variant Sudoku, and much more.

## 3. Three-valued evaluation

A partly filled board cannot answer "is this constraint satisfied?" with a
boolean. Every expression evaluates in Kleene logic to `true`, `false`, or
`unknown`. The player sees these as **satisfied**, **violated**, or
**incomplete**. A predicate reports a violation as early as it can. Two examples
are a duplicate in `allDifferent` and a descending pair in `strictIncreasing`.
The player gets feedback at once. A predicate never guesses a violation that it
cannot prove. This keeps "show me my errors" honest.

## 4. Definitions are injected, not imported

`compilePuzzle(def, registry)` takes the definition registry as an argument. The
runtime has **no build-time dependency** on `src/definitions/`. This has two results:

- `src/puzzles/mini_sudoku.ts` uses only raw primitives. It compiles with
  `compilePuzzle(def, {})`. The acceptance criterion is "delete the three
  example definitions and the runtime does not change". This criterion is a
  passing test, not only a claim.
- A definition returns `{ constraints, objects }`. It owns both its *semantics*
  and its *visuals*. The thermometer emits its `strictIncreasing` constraint and
  its bulb and track visuals from one spec. The engine provides the capability.
  The author provides the meaning.

## 4b. Dynamic behaviour is data too

Some things change with the board: cells uncovered, objects shown, constraints
switched on. Each is an entry in the puzzle `rules`. A rule has a `when`
expression and `then` effects. A rule is a pure function of the current board,
like fog. The session keeps no extra state. Undo, reload, and share links need
no new code. The compiler turns `enable` and `disable` into constraints
(`implies`/`or`). The evaluator and the solver do not change.

## 5. Geometry is an interface; the grid is one implementation

`Geometry` exposes cells, centres, corners, adjacency, region selectors, cursor
stepping, and bounds. `GridGeometry` implements it. `CompositeGeometry` also
implements it. It joins several independently tiled grids in one shared
coordinate space. The Samurai puzzle in `src/puzzles/samurai.ts` runs on it. The
evaluator, session, renderer, and `sudoku` definition do not change. Nothing
assumes a size of 9, a square, or even a grid:

- `buildScene` sets the SVG `viewBox` from `geometry.bounds()`.
- The number pad takes its keys from `domain`.
- The session uses only cell ids.

A 9×9 Sudoku is a small instance. Overlapping grids use the composite geometry.
A hex board or a SudokuCon-scale world needs a new `Geometry` implementation. A
very large board also needs a viewport and culling layer in the renderer. The
evaluator, session, definitions, and format do not change.

`Geometry.boardLines()` supplies the board structure lines: the cell dividers
and the heavier region boundaries. A new geometry draws its own regions. The
renderer only styles `major` lines against minor lines and scales them to pixels.

## 6. State is a framework-agnostic class

`PuzzleSession` is plain TypeScript with a `subscribe`/`revision` pair. It
follows the `HeadersModel` pattern of the reference project. It handles:

- selection and entry
- pencil marks
- undo and redo
- memoised evaluation
- progress snapshots

`usePuzzleSession` connects it to React with `useSyncExternalStore`. The hook
owns only the app-level concerns: keyboard mapping and `localStorage`
persistence.

So the whole interaction model has unit tests that do not need React. A
different client (native, canvas, or another framework) can reuse it unchanged.

## 7. The database is not canonical

The `PuzzleDefinition` artifact is canonical. `/p/<blob>` carries a whole puzzle
and needs no server. The dev "registry" (`src/puzzles/index.ts`) is a `Record`.
It is a deliberate stand-in for a future content service. To use a real service,
change one function in `src/features/play/` to fetch the puzzle.

## What was intentionally left out

The MVP does not include:

- authentication and accounts
- multiplayer
- a hosted editor
- a solver or generator
- rendering of giant worlds
- compression of the URL blob

`PuzzleBuilder` and the codec byte are the places where these features attach
later. Nothing here makes any of them harder to add *architecturally*.

## Test strategy

The tests focus on `src/runtime/` and `src/definitions/`. They cover:

- operators: each primitive, including the three-valued edge cases
- compile: expansion, injection, validation, and error paths
- evaluate: satisfied, violated, incomplete, completion, domain checks, and incremental evaluation
- session: entry, givens, notes, undo and redo, and snapshots
- serialization: round-trip, including re-compile and re-evaluate equality, and unicode
- each definition on its own, and **the four definitions composed on one grid**
- "definitions are not privileged": the primitives that a definition emits give the same result when written by hand
- every built-in puzzle: the solution completes it, the givens are consistent, and the empty board is valid but incomplete
- one jsdom smoke test that solves `mini_sudoku` through the UI
