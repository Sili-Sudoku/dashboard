import { Moon, Sun } from "lucide-react";
import { Link, Route, Routes, useLocation } from "react-router-dom";

import Home from "@/features/home";
import Play from "@/features/play";
import Author from "@/features/author";
import { useTheme } from "@/app/use_theme.ts";

export default function AppRouter() {
    const { theme, toggleTheme } = useTheme();
    // The Play route is the only one with a puzzle board, which wants the
    // viewport-filling layout (board.css/player.css's flex-fill chain) instead
    // of the centered-column default — driven directly off the route rather
    // than a CSS :has(.board-wrap) structural match, since that depends on
    // :has() support and silently no-ops (no error, just the fallback
    // centered layout) on anything that lacks it.
    const isBoardRoute = useLocation().pathname.startsWith("/p/");

    return (
        <div className={`app${isBoardRoute ? " app--board" : ""}`}>
            <header className="app-header">
                <Link to="/" className="logo">
                    Constraint Puzzle Runtime
                </Link>
                <span className="tagline">puzzle types are definitions, not engine features</span>
                <nav>
                    <Link to="/">Puzzles</Link>
                    <Link to="/new">Author</Link>
                    <button
                        type="button"
                        className="theme-toggle"
                        onClick={toggleTheme}
                        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                    >
                        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                </nav>
            </header>

            <main className={`app-main${isBoardRoute ? " app-main--board" : ""}`}>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/p/:ref" element={<Play />} />
                    <Route path="/new" element={<Author />} />
                </Routes>
            </main>
        </div>
    );
}
