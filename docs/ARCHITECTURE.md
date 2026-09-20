# Architecture decisions

The one thesis under test: **can a useful collection of Sudoku variants be
represented and played with a generic constraint runtime rather than hardcoded
variant implementations?** Everything below serves that.

## 1. The engine has no variant vocabulary

`src/runtime/operators.ts` is the *entire* vocabulary the engine understands:
grouping (`cells`, `value`, `values`), arithmetic (`sum`, `+`, `-`, `*`),
counting (`count`, `countValue`), grouping predicates (`allDifferent`), ordering
(`strictIncreasing`, …), comparison, Kleene logic, `adjacent`. Adding a variant
never adds an operator.

There is no `ThermometerConstraint` class, no `variant === "thermo"` branch. Grep
for the variant names outside `src/definitions/` and `src/puzzles/` and you find
only the constraint-panel *labels*.

## 2. Constraints are data (a tiny Lisp), not a language

Constraints are JSON arrays: `["==", ["sum", ["cells", "cage:A"]], 15]`. This is
the smallest thing that composes:

- **Serializable & deterministic** for free — it's JSON.
- **No parser, no grammar, no user-defined functions.** The "predicate" seam the
  brief mentions exists as exactly one feature: `$` inside `count`.
- Adding an operator is one entry in a lookup table with a pure function.

Tradeoff: this is not a general programming language, and deliberately so.
Genuinely novel constraints that need control flow would need either a new
operator or an escape hatch. The MVP bet is that arithmetic + ordering +
counting + set predicates + logic covers the space of "variant Sudoku" and a
large amount beyond it.

## 3. Three-valued evaluation

A partially-filled board can't answer "is this constraint satisfied?" with a
boolean. Every expression evaluates in Kleene logic to `true` / `false` /
`unknown`, surfaced as **satisfied / violated / incomplete**. Predicates report a
violation as early as they can (a duplicate in `allDifferent`, a descending pair
in `strictIncreasing`) so the player gets immediate feedback, but never guess a
violation they can't prove. This keeps "show me my errors" honest.

## 4. Definitions are injected, not imported

`compilePuzzle(def, registry)` takes the definition registry as an argument. The
runtime has **no build-time edge** to `src/definitions/`. Consequences:

- `src/puzzles/mini_sudoku.ts` is authored in raw primitives and compiles with
  `compilePuzzle(def, {})`. The acceptance criterion ("delete the three example
  definitions and the runtime should not fundamentally care") is a passing test,
  not a claim.
- A definition returns `{ constraints, objects }` — it owns both its *semantics*
  and its *visuals*. The thermometer emits its `strictIncreasing` constraint and
  its bulb/track visuals from one spec. The engine provides capability; the
  author provides meaning.

## 5. Geometry is an interface; grid is one implementation

`Geometry` exposes cells, centres/corners, adjacency, region selectors, cursor
stepping, bounds. `GridGeometry` implements it. Nothing assumes 9, square, or
even "grid": `buildScene` sizes the SVG `viewBox` from `geometry.bounds()`, the
number pad derives its keys from `domain`, the session speaks only cell ids.

A 9×9 Sudoku is a small instance. Overlapping grids, hex boards, or a
SudokuCon-scale world would be new `Geometry` implementations (plus, for very
large boards, a viewport/culling layer in the renderer) — no change to the
evaluator, session, definitions, or format.

Tradeoff: `scene.ts`'s `gridLines` still special-cases box lines by
duck-typing `GridGeometry`. That's renderer chrome, not a runtime concept, and
isolated to one function.

## 6. State is a framework-agnostic class

`PuzzleSession` (selection, entry, pencil marks, undo/redo, memoised evaluation,
progress snapshots) is plain TypeScript with a `subscribe`/`revision` pair,
following the reference project's `HeadersModel` pattern. `usePuzzleSession`
bridges it via `useSyncExternalStore` and owns only the genuinely app-level
concerns: keyboard mapping and `localStorage` persistence.

This means the whole interaction model is unit-tested without React, and a
different client (native, canvas, another framework) reuses it unchanged.

## 7. The database is not canonical

The `PuzzleDefinition` artifact is canonical. `/p/<blob>` carries a whole puzzle
with no server. The dev "registry" (`src/puzzles/index.ts`) is a `Record`, a
deliberate stand-in for a future content service — swapping in a fetch is a
one-function change in `src/features/play/`.

## What was intentionally left out

Authentication, accounts, multiplayer, a hosted editor, a solver/generator,
giant-world rendering, compression of the URL blob. The `PuzzleBuilder` and the
codec byte are the seams where those attach later. None of them are made
*architecturally* harder by anything here.

## Test strategy

~100 tests, weighted to `src/runtime/` and `src/definitions/`:

- operators (each primitive, including the 3-valued edges)
- compile (expansion, injection, validation, error paths)
- evaluate (satisfied/violated/incomplete, completion, domain checks, incremental)
- session (entry, givens, notes, undo/redo, snapshots)
- serialization (round-trip *including* re-compile + re-evaluate equality, unicode)
- each definition in isolation + **the four composed on one grid**
- "definitions are not privileged": the primitives a definition emits, hand-written, evaluate identically
- every built-in puzzle: solution completes it, givens are consistent, empty board is valid-but-incomplete
- one jsdom smoke test that actually solves `mini_sudoku` through the UI
