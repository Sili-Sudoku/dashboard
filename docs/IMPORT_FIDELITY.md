# Import fidelity

What each site's format keeps when you import or export. The rule: **an importer or exporter never drops a rule
silently.** Anything it cannot use produces a warning that the Author page shows. A test checks this
(`src/interop/fidelity.test.ts`).

"f-puzzles" also covers SudokuPad, which reads and writes the same JSON. Penpa+ is not supported.

The formats come from community documentation and from the live apps' own files. The sandbox that built this has no
route to the sites, so the matrix is not checked against a large set of real puzzles. Treat ✅ as "works for the
files we have seen". ⚠️ means partly, see the notes.

| Feature (f-puzzles JSON key)                  | f-puzzles import | f-puzzles export | SudokuMaker import | SudokuMaker export |
| --------------------------------------------- | ---------------- | ---------------- | ------------------ | ------------------ |
| `size`, `grid` givens, `title`, `author`      | ✅              | ✅              | ✅                | ✅                |
| `ruleset` (description)                       | ✅              | ✅              | ✅                | ✅                |
| `solution`                                    | ✅              | ✅              | ✅                | ❌                 |
| Rectangular boxes                             | ✅              | ✅              | ✅                | ✅                |
| Jigsaw regions                                | ⚠️ (1)         | ✅              | ⚠️ (1)           | ✅                |
| `killercage`                                  | ✅              | ✅              | ✅                | ✅                |
| `thermometer`                                 | ✅              | ✅              | ✅                | ✅                |
| `arrow`                                       | ✅              | ✅              | ✅                | ✅                |
| `difference`, `ratio` (kropki dots)           | ✅              | ✅              | ✅                | ✅                |
| `xv`                                          | ✅              | ✅              | ❌                 | ❌                 |
| `negative`                                    | ✅ (2)          | ✅              | ❌                 | ❌                 |
| `odd`, `even`                                 | ✅              | ✅              | ✅                | ✅                |
| `minimum`, `maximum`                          | ✅              | ✅              | ❌                 | ❌                 |
| `diagonal+`, `diagonal-`                      | ✅              | ✅              | ❌                 | ❌                 |
| `antiknight`, `antiking`, `nonconsecutive`    | ✅              | ✅              | ❌                 | ❌                 |
| `disjointgroups`                              | ⚠️ (3)         | ✅              | ❌                 | ❌                 |
| `palindrome`, `betweenline`                   | ✅              | ✅              | ❌                 | ❌                 |
| `clone`, `quadruple`                          | ✅              | ✅              | ❌                 | ❌                 |
| `littlekillersum`, `sandwichsum`              | ✅ (4)          | ✅              | ❌                 | ❌                 |
| Other clue types (5)                          | ❌               | n/a              | ❌                 | n/a                |

1. The rule is kept. The drawn box lines do not follow the regions yet, and the importer says so.
2. Kinds `difference`, `ratio` and `xv`, and the synonyms other exporters use. Other kinds get a warning.
3. Needs a uniform box layout. Otherwise it is omitted, with a warning.
4. The clue sits on an anchor cell outside the grid.
5. Warned about by name (f-puzzles) or by number (SudokuMaker) and ignored. Examples from community notes, not
   verified: `line`, `cage`, `circle`, `rectangle`, `text`, `extraregion`. A real rule among them is missing from
   the imported puzzle.

Other cases that get a warning:

- A clue whose cells do not resolve is skipped.
- A grid with no region data uses the standard boxes on a square size, and no boxes on other sizes.
- An invalid `solution` is ignored.
- Export of a hand-written primitive constraint, or of a shape the format cannot hold, is skipped.

## Not done

A large corpus of real exported puzzles. Add real files under `src/interop/` as tests when you have them.
