import { Link } from "react-router-dom";

import "./style.css";

export default function Landing() {
    return (
        <div className="landing">
            <section className="lp-hero">
                <div className="lp-hero-copy">
                    <p className="lp-kicker">a constraint runtime, not a single Sudoku app</p>
                    <h1>
                        Every variant is <em>data.</em>
                    </h1>
                    <p className="lp-lede">
                        Thermometers, killer cages, arrows, and kropki dots are common puzzle constraints. This engine
                        does not build any of them in directly. Instead, each one exists as a small, swappable
                        definition. That definition runs on the same solver and board as every other constraint.
                    </p>
                    <div className="lp-ctas">
                        <Link to="/puzzles" className="btn btn-primary lp-btn">
                            Browse the puzzles
                        </Link>
                        <Link to="/new" className="btn lp-btn">
                            Try the author tool
                        </Link>
                    </div>
                </div>

                <div className="lp-hero-art" aria-hidden="true">
                    <div className="lp-sheet lp-sheet-back" />
                    <div className="lp-sheet lp-sheet-mid" />
                    <svg className="lp-sheet lp-sheet-front" viewBox="0 0 240 240" role="presentation">
                        <rect x="1" y="1" width="238" height="238" rx="4" className="lp-grid-paper" />
                        {Array.from({ length: 5 }, (_, i) => (
                            <line
                                key={`v${i}`}
                                x1={20 + i * 50}
                                y1="20"
                                x2={20 + i * 50}
                                y2="220"
                                className="lp-grid-line"
                            />
                        ))}
                        {Array.from({ length: 5 }, (_, i) => (
                            <line
                                key={`h${i}`}
                                x1="20"
                                y1={20 + i * 50}
                                x2="220"
                                y2={20 + i * 50}
                                className="lp-grid-line"
                            />
                        ))}

                        {/* cage */}
                        <rect x="27" y="27" width="86" height="36" rx="4" className="lp-cage" />

                        {/* thermometer */}
                        <line x1="170" y1="170" x2="170" y2="70" className="lp-thermo-stem" />
                        <circle cx="170" cy="170" r="12" className="lp-thermo-bulb" />

                        {/* kropki dot between two cells */}
                        <circle cx="120" cy="120" r="5" className="lp-kropki" />

                        <text x="45" y="52" className="lp-digit">
                            3
                        </text>
                        <text x="95" y="52" className="lp-digit">
                            7
                        </text>
                        <text x="195" y="100" className="lp-digit">
                            1
                        </text>
                        <text x="195" y="200" className="lp-digit">
                            9
                        </text>
                        <text x="45" y="200" className="lp-digit">
                            5
                        </text>
                    </svg>
                </div>
            </section>

            <section className="lp-manifesto">
                <article>
                    <span className="lp-num">01</span>
                    <h2>Variants are not hardcoded</h2>
                    <p>
                        A thermometer is not a hardcoded feature. It is a constraint, defined the same way as any other
                        variant. Because each constraint is a plain definition, you can customize one or create a new
                        one yourself. That same definition is easy to share with other puzzle makers.
                    </p>
                </article>
                <article>
                    <span className="lp-num">02</span>
                    <h2>Import your puzzle</h2>
                    <p>
                        You can import a puzzle that you made in f-puzzles or SudokuMaker, and share it with the
                        community here. The same path works in reverse: you can create a puzzle here and export it to
                        SudokuPad. Because both directions are open, you control when to import or export your puzzle.
                    </p>
                </article>
                <article>
                    <span className="lp-num">03</span>
                    <h2>Authoring options</h2>
                    <p>
                        You can create a puzzle in two ways: edit a JSON file, or use the visual drag-and-drop editor.
                        Both produce the same definition, so you can choose whichever fits your workflow.
                    </p>
                </article>
            </section>

            <section className="lp-roadmap">
                <h2>Planned features</h2>
                <ul className="lp-roadmap-list">
                    <li>
                        <span className="lp-stamp">planned</span>
                        Publish your puzzles. Other users can find and play them.
                    </li>
                    <li>
                        <span className="lp-stamp">planned</span>
                        Ratings, difficulty feedback, and comments on puzzles
                    </li>
                    <li>
                        <span className="lp-stamp">planned</span>
                        Creator profiles. Follow the creators you like.
                    </li>
                    <li>
                        <span className="lp-stamp">planned</span>
                        Badges that mark solving milestones
                    </li>
                </ul>
            </section>

            <section className="lp-closer">
                <h2>Play a puzzle, or create one.</h2>
                <div className="lp-ctas">
                    <Link to="/puzzles" className="btn btn-primary lp-btn">
                        Browse the puzzles
                    </Link>
                    <Link to="/new" className="btn lp-btn">
                        Try the author tool
                    </Link>
                </div>
            </section>
        </div>
    );
}
