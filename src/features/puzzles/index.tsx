import { Link } from "react-router-dom";

import { listPuzzles } from "@/puzzles/index.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { definitions } from "@/definitions/index.ts";

import "./style.css";

export default function PuzzleList() {
    const puzzles = listPuzzles();

    return (
        <div className="puzzles-page">
            <section className="puzzles-intro">
                <h1>Puzzles</h1>
                <p>
                    Classic Sudoku plus variants — thermometers, killer cages, arrows, and kropki dots — all
                    on the same board. Already have a puzzle from f-puzzles, SudokuPad, or SudokuMaker?{" "}
                    <Link to="/new">Bring it in</Link> and solve it here instead.
                </p>
            </section>

            <section className="puzzles-list">
                {puzzles.map((p) => {
                    const compiled = compilePuzzle(p, definitions);
                    const sources = compiled instanceof Error ? [] : uniqueSources(compiled.constraints);
                    return (
                        <Link key={p.metadata.id} to={`/p/${p.metadata.id}`} className="puzzle-card">
                            <div className="pc-title">{p.metadata.title}</div>
                            <p className="pc-desc">{p.metadata.description}</p>
                            <div className="pc-meta">
                                <span>
                                    {p.geometry.width}×{p.geometry.height}
                                </span>
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
                })}
            </section>
        </div>
    );
}

const uniqueSources = (constraints: readonly { source: string }[]): string[] => [
    ...new Set(constraints.map((c) => c.source)),
];
