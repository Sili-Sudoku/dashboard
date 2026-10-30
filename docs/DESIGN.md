# Visual identity

As of 2026-10-30 the app runs two different visual languages at once, on
purpose, mid-migration. If you're picking up a UI card, read this first —
it tells you which one a given surface should use and why the split exists.

## 1. The "ink & paper" identity

Introduced on the landing page (kanban #67), then extended to the shared
header/nav/theme-toggle and the `/puzzles` browse cards (#139, in progress).
Not pulled from a named template or component library — hand-written CSS
combining two recognizable, nameable ingredients:

- **Neobrutalism** for interactive elements: thick solid borders, flat offset
  drop-shadows instead of blurred ones, a small translate-on-hover "press"
  instead of a color fade, no gradients. This is where `.lp-btn`/`.puzzle-card`
  get their look.
- **A bespoke "paper and ink" palette + serif display type**, not a named
  movement — picked by hand to read like a marked-up puzzle book rather than
  a SaaS dashboard: cream paper, near-black ink, exactly one warm accent (a
  red "grading pen"), one cooler secondary accent (a moss green, used
  sparingly — stamp badges, the cage motif). Headlines use a serif stack
  (`Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif`)
  instead of the app's default `system-ui` sans.

Tokens live in `src/style.css`'s `:root[data-theme="light"|"dark"]` blocks as
`--chrome-*` (`--chrome-paper`, `--chrome-ink`, `--chrome-pen`,
`--chrome-moss`, …) — named `chrome` rather than replacing `--bg`/`--surface`/
`--ink` directly, because of §3 below. Reach for these on any new
visitor-facing or non-solving surface (landing, puzzle browsing, future
account/community pages) rather than inventing new hex values or falling
back to `--brand`/`--accent`.

**Currently using it:** `src/features/landing/`, the shared `.app-header`
chrome (`src/style.css`), `src/features/puzzles/` (browse cards).

**Not yet migrated, on purpose:** the player sidebar (`src/player/`,
`player.css`) and the author tool (`src/features/author/`) — see #139.

## 2. The original utilitarian theme

`--bg`/`--surface`/`--ink`/`--brand`/`--accent` (the cooler blue-indigo
palette) — still backs every puzzle-solving surface: the board itself, the
player sidebar, the author tool. This is deliberate, not neglect: the
constraint-graphic colors below are tuned against it.

## 3. Why the board's colors are a separate concern

`--thermo`, `--cage`, `--arrow`, `--palindrome`, `--betweenline`,
`--diagonal`, `--violated`/`--violated-line`, `--satisfied`/`--satisfied-tint`/
`--satisfied-border`, `--incomplete`, `--fog`/`--fog-line` (all in
`src/style.css`) aren't decoration — they're the only way a player
distinguishes "this constraint is violated" from "this one's fine" from "this
cell is still fogged." They were tuned for contrast against `--bg`/
`--surface`, not against `--chrome-paper`. Swapping the surface around the
board without re-checking these would risk making a puzzle *harder to read*,
not just differently colored — so that re-check is its own deliberate step
(#139), not a side effect of a chrome/palette pass elsewhere.

**Open question, not yet decided** (flagged for the user on #139): should
`--bg`/`--surface`/`--ink` eventually just become the warm palette
everywhere, retiring `--chrome-*` as a transitional name — or should solving
surfaces stay on the cooler palette permanently (a plausible reason: eye
strain over a long solve session)? Ask before assuming either way.

## 4. Related board work

- **#139** — carry `--chrome-*` into the player/author chrome, with the
  contrast check above as a precondition.
- **#136** — a shared `--space-*`/`--radius-*`/`.btn` primitive is planned to
  deduplicate five independently-declared `button { … }` rules. Build it on
  `--chrome-*`, not `--brand`, so it doesn't need a second recolor once #139
  lands.
- **#128/#135** — separate concerns (visual hierarchy/grouping, not color).
  Don't conflate a "where does this control go" fix with a "what color is
  it" fix.
