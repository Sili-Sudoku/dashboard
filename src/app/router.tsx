import { Link, Route, Routes } from "react-router-dom";

import Home from "@/features/home";
import Play from "@/features/play";
import Author from "@/features/author";

export default function AppRouter() {
    return (
        <div className="app">
            <header className="app-header">
                <Link to="/" className="logo">
                    Constraint Puzzle Runtime
                </Link>
                <span className="tagline">puzzle types are definitions, not engine features</span>
                <nav>
                    <Link to="/">Puzzles</Link>
                    <Link to="/new">Author</Link>
                </nav>
            </header>

            <main className="app-main">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/p/:ref" element={<Play />} />
                    <Route path="/new" element={<Author />} />
                </Routes>
            </main>
        </div>
    );
}
