import { FEEDBACK_EMAIL, FEEDBACK_HREF } from "@/app/feedback.ts";
import { Link } from "react-router-dom";

import HeroSheet from "./hero_sheet.tsx";

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

            <footer className="lp-footer">
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
