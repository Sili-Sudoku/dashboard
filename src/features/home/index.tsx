import { Link } from "react-router-dom";

import { listPuzzles } from "@/puzzles/index.ts";
import { compilePuzzle } from "@/runtime/compile.ts";
import { definitions } from "@/definitions/index.ts";

import "./style.css";

export default function Home() {
    const puzzles = listPuzzles();

    return (
        <div className="home">
            <section className="home-intro">
                <h1>A generic constraint puzzle runtime</h1>
                <p>
                    The engine understands cells, regions, values, sums, ordering, counting, logic and
                    adjacency. It does <strong>not</strong> understand &ldquo;thermometer&rdquo; or
                    &ldquo;killer cage&rdquo;. Those are <Link to="/new">definitions</Link> — small packages that
                    compile to the same primitive constraints you could write by hand.
                </p>
            </section>

            <section className="home-list">
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
