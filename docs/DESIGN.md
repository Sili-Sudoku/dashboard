# Visual identity

The whole app uses one visual language: **ink & paper**. When you
work on a UI card, match this look.

## The look

The CSS is hand-written. It does not come from a template or a component
library. It combines two named ideas:

- **Neobrutalism for interactive elements.** Borders are solid 2px ink. Shadows
  are flat and offset, not blurred. On hover, an element moves a little to
  look pressed, instead of fading its color. There are no gradients. `.btn`
  (`src/style.css`) is the one button primitive. Landing page CTAs are plain
  `.btn` or `.btn-primary`. `.lp-btn` only makes them larger. Panels (`.pp-solve`,
  the constraint and shortcut boxes, toasts) use the same 2px ink border.
- **A paper-and-ink palette with serif display type.** We chose it by hand so
  that the app looks like a marked-up puzzle book, not a SaaS dashboard. It has
  cream paper and near-black ink. It has one warm accent (the red "grading
  pen") and one cooler second color (moss green, used for stamp badges and the
  cage motif). Headings use `--font-display` (`Georgia, "Iowan Old Style", …,
  serif`). Body text uses `system-ui`.

## Tokens

All tokens are in `src/style.css`, under `:root[data-theme="light"|"dark"]`.

- **Surfaces and text:** `--bg` (paper), `--surface` (lighter cream, for the
  board, panels, and inputs), `--surface-alt` (hover and headers), `--ink`,
  `--ink-soft`, `--line`, `--line-strong`.
- **`--brand`: pen-blue ink.** This is the one cool color. Use it for
  interactive state: selection rings, active toggles, links, focus, and the
  digits that the player enters. It is deliberately *not* the red pen. Red
  already means "this breaks a rule". A red selection ring looks like a
  violation.
- **Board and state colors:** `--violated`/`--violated-line`, `--invalid`,
  `--satisfied*`, `--incomplete`, `--fog*`, and the constraint graphics
  `--thermo`, `--cage`, `--arrow`, `--palindrome`, `--betweenline`,
  `--diagonal`. A player uses these colors to tell "violated" from "fine" from
  "still fogged". We tuned them for contrast, not decoration.
- **`--chrome-*`:** the names that the landing page, header, and puzzle cards
  first used. Where a name has the same meaning as an app token, it is an alias
  (`--chrome-paper` = `--bg`). The other names (`--chrome-moss` and others) still
  have their own values. In new code, use the app tokens.
- **Scales:** `--space-1..4`, `--radius-sm/md/lg`, `--font-display`.

## Contrast (measured, WCAG ratios against `--surface`)

We re-tuned the board colors against cream. We did not carry them over from the
old cool theme. No ratio is worse than before the change:

| Token | Light (old → new) | Dark (old → new) |
| --- | --- | --- |
| thermo | 2.5 → 2.5 | 3.8 → 3.8 |
| diagonal | 1.8 → 1.9 | 1.8 → 2.0 |
| fog fill vs surface | 1.4 → 1.45 | 1.25 → 1.26 |
| violated fill vs surface | 1.25 → 1.28 | 1.18 → 1.23 |
| satisfied (text) | 3.3 → 4.9 | — → 6.4 |
| violated-line on violated fill | 3.8 → 4.4 | — → 5.2 |
| brand / entered digit | 5.5 → 7.8 | — → 7.0 |

Fills such as fog and violated are *tints*, and they are subtle on purpose. The
line and text colors carry the meaning. For violations, the screen-reader
announcement also carries the meaning. Check this table again if you
change a state color.

A state never depends on color alone, so the UI works with red-green and other
color blindness. A broken cell has a hatch over its tint. A constraint row has
an icon and a word ("broken", "pending", "all satisfied"). A toast has an icon.
The mark colors were chosen to stay apart under protan, deutan and tritan
simulation (`src/runtime/mark_colors.ts`). When you add a new state, give it a
shape or a word too.

## Do not

- Do not add new hex values for chrome. Use the tokens above.
- Do not use red (`--accent`, `--violated*`) for anything except "wrong" or a
  purely decorative accent (the "data." underline and the thermometer art on
  the landing page). Never use red on anything clickable, including hover states.
- Do not mix up "where does this control go" (`docs/UI_PLACEMENT.md`) with
  "what does it look like" (this file).

## Palettes

The Style setting picks a palette (`data-palette` on the root element, `src/app/use_palette.ts`).
Coffee & cream is the default and sets no attribute. Slate, Sage and Plum keep the same look with
another hue for the paper, the ink and the brand blue. Classic is a plain look with system fonts.
A palette sets neutral and brand tokens only. The state colors keep their red, green and amber,
because those hues carry meaning. To add a palette, add one block for light and one for dark in
`src/style.css`, add it to `PALETTES`, and add it to the list in the script of `index.html`
(a test checks that the two lists match). Use tokens in new CSS, not hex values, so that every
palette reaches the new surface.
