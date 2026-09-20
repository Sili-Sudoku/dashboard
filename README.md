# Constraint Puzzle Runtime

A generic runtime for Sudoku and variant-Sudoku puzzles. The engine understands
generic primitives — cells, regions, values, sums, ordering, counting, logic,
adjacency. **Puzzle types are definitions expressed with those primitives, not
features baked into the engine.**

A thermometer is not a runtime concept. It is a five-line function that compiles
to `["strictIncreasing", ["cells", [...]]]` plus a couple of visual objects.
Delete `src/definitions/` and the runtime doesn't notice: puzzles written in
primitive constraints still load, evaluate, render and play.

## Quickstart

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 100+ unit tests, runtime-focused
npm run build      # tsc -b && vite build
npm run lint
```

Open the **"Four Systems, One Grid"** puzzle: classic Sudoku + a killer cage + a
thermometer + an arrow, all on one board, none known to the engine.

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

- `src/runtime/` — the engine. Pure TypeScript, no React import. This is the
  intellectual property and where the tests concentrate.
- `src/definitions/` — variant packages (`sudoku`, `thermometer`, `killer`,
  `arrow`). Pure `(params, ctx) => { constraints, objects }`. The registry is
  **passed into** `compilePuzzle`, never imported by the runtime.
- `src/renderer/` — `scene.ts` (pure geometry → drawable shapes) + `Board.tsx`.
- `src/player/` — React bridge (`usePuzzleSession`), number pad, controls,
  constraint panel.
- `src/puzzles/` — the dev registry. `mini_sudoku.ts` is authored entirely in
  primitives to prove runtime independence from definitions.
- `src/authoring/` — `PuzzleBuilder`, the fluent seam a hosted editor would use.

## Docs

- [`docs/PUZZLE_FORMAT.md`](docs/PUZZLE_FORMAT.md) — the artifact JSON and the
  constraint language reference.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — decisions and tradeoffs.

## URL sharing

`/p/<id>` resolves against the dev registry. `/p/<blob>` decodes a full artifact
straight from the URL (`<codec><base64url(JSON)>`) — no server, no account. The
codec byte leaves room for a compressed encoding later without a breaking change.
