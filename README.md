# Constraint Puzzle Runtime

A generic runtime for Sudoku and variant-Sudoku puzzles. The engine knows only
generic primitives: cells, regions, values, sums, ordering, counting, logic, and
adjacency. **Puzzle types are definitions built from these primitives. They are
not features of the engine.**

A thermometer is not a runtime concept. It is a five-line function. It compiles
to `["strictIncreasing", ["cells", [...]]]` plus a few visual objects.
Delete `src/definitions/` and the runtime still works. Puzzles written with
primitive constraints still load, evaluate, render, and play.

## Quickstart

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests, mostly for the runtime
npm run build      # tsc -b && vite build
npm run lint
```

Open the **"Four Systems, One Grid"** puzzle. It has a classic Sudoku, a killer
cage, a thermometer, and an arrow on one board. The engine knows none of them.

## How it fits together

```
PuzzleDefinition (JSON artifact: metadata, geometry, domain, givens,
        │                        regions, objects, constraints, solution)
        │   parsePuzzle → compilePuzzle(def, definitionRegistry)
        ▼
CompiledPuzzle  { geometry, domain, givens, regions, objects,
        │          constraints: primitive Expr[] }
        │
   ┌────┴───────────────┬────────────────────┐
   ▼                    ▼                    ▼
PuzzleSession       evaluate()           buildScene() → <Board/>
selection, entry,   Kleene 3-valued:     generic SVG shapes
notes, undo/redo    satisfied /          (polyline, circle, cage,
                    violated /           arrowhead, text …)
                    incomplete
```

- `src/runtime/` is the engine. It is pure TypeScript and has no React import.
  Most tests are here.
- `src/definitions/` holds the variant packages (`sudoku`, `thermometer`,
  `killer`, `arrow`). Each one is a pure function `(params, ctx) => { constraints, objects }`.
  The caller passes the registry **into** `compilePuzzle`. The runtime never imports it.
- `src/renderer/` has `scene.ts` (pure function: geometry to drawable shapes) and `Board.tsx`.
- `src/player/` is the React layer: `usePuzzleSession`, the number pad, the
  controls, and the constraint panel.
- `src/puzzles/` is the dev registry. `mini_sudoku.ts` uses only primitives. It
  shows that the runtime does not depend on definitions.
- `src/authoring/` has `PuzzleBuilder`. A hosted editor can use this fluent API.

## Docs

- [`docs/PUZZLE_FORMAT.md`](docs/PUZZLE_FORMAT.md): the artifact JSON and the
  constraint language reference.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): decisions and trade-offs.
- [`docs/DESIGN.md`](docs/DESIGN.md): the visual identity. It lists which
  parts use the warm "ink & paper" look, which parts keep the original theme,
  and why.
- [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md): the rules for commits.

## URL sharing

`/p/<id>` looks up a puzzle in the dev registry. `/p/<blob>` decodes a full
artifact from the URL (`<codec><base64url(JSON)>`). It needs no server and no
account. The codec byte lets a compressed encoding be added later without a
breaking change.
