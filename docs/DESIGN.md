# Visual identity

One visual language app-wide, as of #139: **ink & paper**. If you're picking up
a UI card, this is what to match.

## The look

Not pulled from a template or component library — hand-written CSS combining
two nameable ingredients:

- **Neobrutalism for interactive elements:** solid 2px ink borders, flat offset
  drop-shadows instead of blurred ones, a small translate-on-hover "press"
  instead of a color fade, no gradients. `.btn` (`src/style.css`) is the one
  button primitive; landing CTAs are plain `.btn`/`.btn-primary` (`.lp-btn` only enlarges them). Panels
  (`.pp-solve`, the constraint/shortcut boxes, toasts) use the same 2px ink
  border.
- **A paper-and-ink palette plus serif display type**, picked by hand to read
  like a marked-up puzzle book rather than a SaaS dashboard: cream paper,
  near-black ink, one warm accent (the red "grading pen"), one cooler secondary
  (moss green — stamp badges, the cage motif). Headings use `--font-display`
  (`Georgia, "Iowan Old Style", …, serif`); body text stays `system-ui`.

## Tokens

All in `src/style.css`, `:root[data-theme="light"|"dark"]`.

- **Surfaces/text:** `--bg` (paper), `--surface` (lighter cream: board, panels,
  inputs), `--surface-alt` (hover/headers), `--ink`, `--ink-soft`, `--line`,
  `--line-strong`.
- **`--brand`: pen-blue ink.** The one cool color, used for interactive state —
  selection rings, active toggles, links, focus, and the player's own entered
  digits. It is deliberately *not* the red pen: red already means "this breaks a
  rule", and a red selection ring would read as a violation.
- **Board/state colors:** `--violated`/`--violated-line`, `--invalid`,
  `--satisfied*`, `--incomplete`, `--fog*`, and the constraint graphics
  `--thermo`, `--cage`, `--arrow`, `--palindrome`, `--betweenline`,
  `--diagonal`. These are the only way a player tells "violated" from "fine"
  from "still fogged", so they are tuned for contrast, not decoration.
- **`--chrome-*`:** the names the landing page/header/puzzle cards were built on.
  Where they mean the same as an app token they alias it (`--chrome-paper` =
  `--bg`); the rest (`--chrome-moss`, …) are still their own
  values. Prefer the app tokens in new code.
- **Scales:** `--space-1..4`, `--radius-sm/md/lg`, `--font-display`.

## Contrast (measured, WCAG ratios vs `--surface`)

The board colors were re-tuned against cream, not carried over from the old cool
theme, and nothing got worse than before the change:

| Token | Light (old → new) | Dark (old → new) |
| --- | --- | --- |
| thermo | 2.5 → 2.5 | 3.8 → 3.8 |
| diagonal | 1.8 → 1.9 | 1.8 → 2.0 |
| fog fill vs surface | 1.4 → 1.45 | 1.25 → 1.26 |
| violated fill vs surface | 1.25 → 1.28 | 1.18 → 1.23 |
| satisfied (text) | 3.3 → 4.9 | — → 6.4 |
| violated-line on violated fill | 3.8 → 4.4 | — → 5.2 |
| brand / entered digit | 5.5 → 7.8 | — → 7.0 |

Fills like fog/violated are *tints* meant to be subtle; the line/text colors
(and, for violations, the screen-reader announcement — see #64) carry the
meaning. Re-check this table if you touch a state color.

## Don't

- Don't invent new hex values for chrome; use the tokens above.
- Don't use red (`--accent`, `--violated*`) for anything that isn't "wrong" or
  a purely decorative accent (the landing page's "data." underline and thermometer art) — never on anything clickable, including hover states.
- Don't conflate "where does this control go" (`docs/UI_PLACEMENT.md`) with
  "what does it look like" (this file).
