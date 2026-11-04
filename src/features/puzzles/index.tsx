import { describeGeometry } from "@/runtime/geometry.ts";
import { Link } from "react-router-dom";

import { listFixtures, listPuzzles } from "@/puzzles/index.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { definitions } from "@/definitions/index.ts";

import "./style.css";

/** One card of the list. */
function PuzzleCard({ puzzle: p }: { puzzle: PuzzleDefinition }) {
    const compiled = compilePuzzle(p, definitions);
    const sources = compiled instanceof Error ? [] : uniqueSources(compiled.constraints);
    return (
        <Link to={`/p/${p.metadata.id}`} className="puzzle-card">
            <div className="pc-title">{p.metadata.title}</div>
            <p className="pc-desc">{p.metadata.description}</p>
            <div className="pc-meta">
                <span>{describeGeometry(p.geometry)}</span>
                <span>{p.metadata.difficulty}</span>
            </div>
            <div className="pc-sources">
                {sources.map((s) => (
                    <span key={s} className="pc-chip">
                        {s}
                    </span>
                ))}
            </div>
        </Link>
    );
}

export default function PuzzleList() {
    const puzzles = listPuzzles();
    // Test puzzles (big boards, the rules demo) are for developers. A visitor of the built app never sees them.
    const fixtures = import.meta.env.DEV ? listFixtures() : [];

    return (
        <div className="puzzles-page">
            <section className="puzzles-intro">
                <h1>Puzzles</h1>
                <p>
                    Play classic Sudoku and variants on one board. Variants include thermometers, killer cages, arrows,
                    and kropki dots. Do you have a puzzle from f-puzzles, SudokuPad, or SudokuMaker?{" "}
                    <Link to="/new">Import it</Link> and solve it here.
                </p>
            </section>

            <section className="puzzles-list">
                {puzzles.map((p) => (
                    <PuzzleCard key={p.metadata.id} puzzle={p} />
                ))}
            </section>

            {fixtures.length > 0 && (
                <section className="puzzles-fixtures" aria-label="Development fixtures">
                    <h2>Test puzzles</h2>
                    <p>Only in development. They exist to test and measure the app.</p>
                    <div className="puzzles-list">
                        {fixtures.map((p) => (
                            <PuzzleCard key={p.metadata.id} puzzle={p} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

const uniqueSources = (constraints: readonly { source: string }[]): string[] => [
    ...new Set(constraints.map((c) => c.source)),
];
