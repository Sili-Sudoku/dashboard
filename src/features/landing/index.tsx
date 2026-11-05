import { FEEDBACK_EMAIL, FEEDBACK_HREF, SOURCE_HREF } from "@/app/feedback.ts";
import { Link } from "react-router-dom";

import HeroSheet from "./hero_sheet.tsx";

import "./style.css";

export default function Landing() {
    return (
        <div className="landing">
            <section className="lp-hero">
                <div className="lp-hero-copy">
                    <p className="lp-kicker">sudoku variants, in your browser</p>
                    <h1>
                        Solve variant sudoku. <em>Make your own.</em>
                    </h1>
                    <p className="lp-lede">
                        Thermometers, killer cages, arrows, kropki dots and more. Play puzzles on a clean board that
                        works on a phone, or build one yourself and let the solver check that it has exactly one answer.
                    </p>
                    <p className="lp-source">
                        Source-available under the Business Source License.
                        {SOURCE_HREF && (
                            <>
                                {" "}
                                <a href={SOURCE_HREF}>Read the code</a>
                            </>
                        )}
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

                <Link to="/p/first-puzzle" className="lp-hero-side">
                    <div className="lp-hero-art" aria-hidden="true">
                        <div className="lp-sheet lp-sheet-back" />
                        <div className="lp-sheet lp-sheet-mid" />
                        <HeroSheet />
                    </div>
                    <span className="btn btn-primary lp-btn lp-solve">Solve this puzzle</span>
                </Link>
            </section>

            <section className="lp-manifesto">
                <article>
                    <span className="lp-num">01</span>
                    <h2>Solve</h2>
                    <p>
                        Pencil marks, colours, undo and a check against the solution. Everything runs in your browser,
                        with no account and no install.
                    </p>
                </article>
                <article>
                    <span className="lp-num">02</span>
                    <h2>Make your own</h2>
                    <p>
                        Use the visual editor or edit the JSON directly. Both give the same puzzle, and the solver tells
                        you whether it has one solution, several, or none.
                    </p>
                </article>
                <article>
                    <span className="lp-num">03</span>
                    <h2>Bring your puzzles</h2>
                    <p>
                        Import from f-puzzles or SudokuMaker, and export to SudokuPad. Anything that cannot carry over
                        is reported rather than silently dropped.
                    </p>
                </article>
            </section>

            <section className="lp-roadmap lp-thesis">
                <h2>How it works</h2>
                <p>
                    No variant is built into the board. A thermometer is a small definition, the same kind as every
                    other constraint, and they all run on one solver. That is why you can change a rule or add a new
                    one, and share it as plain data.
                </p>
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

            <footer className="lp-footer">
                {SOURCE_HREF && (
                    <>
                        <a href={SOURCE_HREF}>Source code</a>
                        {" · "}
                    </>
                )}
                <Link to="/ai">AI disclaimer</Link>
                {" · "}
                <a href="/third-party-notices.txt">Third-party licences</a>
                {" · "}
                <a href={FEEDBACK_HREF} data-tip={FEEDBACK_EMAIL} data-tip-align="end">
                    Feedback
                </a>
            </footer>
        </div>
    );
}
