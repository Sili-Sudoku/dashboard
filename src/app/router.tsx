import { useState } from "react";
import { Moon, Settings as SettingsIcon, Sun } from "lucide-react";
import { Link, Route, Routes, useLocation } from "react-router-dom";

import Landing from "@/features/landing";
import PuzzleList from "@/features/puzzles";
import Play from "@/features/play";
import Author from "@/features/author";
import Settings from "@/features/settings";
import { ToastViewport } from "@/app/toast_viewport.tsx";
import { useTheme } from "@/app/use_theme.ts";
import { PageActionsContext, PageHeaderContext, type PageHeader } from "@/app/page_header.ts";

export default function AppRouter() {
    const { theme, toggleTheme } = useTheme();
    const [pageHeader, setPageHeader] = useState<PageHeader | null>(null);
    // Passing useState's setter straight to `ref` is the standard "wait for
    // the DOM node, then re-render with it" idiom — React calls it with the
    // element on mount/unmount, so Play's View JSON/Share buttons can portal
    // into it once it exists instead of rendering their own top-of-page row.
    const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
    // Play and Author both render a live puzzle board (Author's is the
    // embedded preview next to the JSON editor) and want the viewport-filling
    // layout (board.css/player.css's flex-fill chain) instead of the
    // centered-column default — driven directly off the route rather than a
    // CSS :has(.board-wrap) structural match, since that depends on :has()
    // support and silently no-ops (no error, just the fallback centered
    // layout) on anything that lacks it.
    const pathname = useLocation().pathname;
    const isBoardRoute = pathname.startsWith("/p/") || pathname === "/new";
    // The landing page runs its own full-bleed sections (hero/manifesto/closer
    // bands) with their own palette and padding — the centered 1100px column
    // below is specifically for the app's working pages, not this one.
    const isLandingRoute = pathname === "/";

    return (
        <PageActionsContext.Provider value={actionsSlot}>
            <PageHeaderContext.Provider value={setPageHeader}>
                <div className={`app${isBoardRoute ? " app--board" : ""}`}>
                    <header className="app-header">
                        <Link to="/" className="logo">
                            Constraint Puzzle Runtime
                        </Link>
                        {/* Play/Author register their own title here via usePageHeader
                            instead of rendering a big in-page h1+p — the description
                            (when there is one) is just a native hover tooltip, not
                            another line taking up space. Falls back to the tagline
                            on routes that don't set one (Home). */}
                        {pageHeader ? (
                            <span className="app-header-page" title={pageHeader.description}>
                                <span className="app-header-sep" aria-hidden="true">
                                    ›
                                </span>
                                {pageHeader.title}
                                {pageHeader.byline && (
                                    <span className="app-header-byline">{pageHeader.byline}</span>
                                )}
                            </span>
                        ) : (
                            <span className="tagline">puzzle types are definitions, not engine features</span>
                        )}
                        {/* Play portals its View JSON/Share buttons in here (see
                            page_header.ts) instead of rendering its own row. */}
                        <span className="app-header-actions" ref={setActionsSlot} />
                        <nav>
                            <Link to="/puzzles">Puzzles</Link>
                            <Link to="/new">Author</Link>
                            <Link to="/settings" className="theme-toggle" aria-label="Settings">
                                <SettingsIcon size={16} />
                            </Link>
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

                    <main
                        className={`app-main${isBoardRoute ? " app-main--board" : ""}${
                            isLandingRoute ? " app-main--landing" : ""
                        }`}
                    >
                        <Routes>
                            <Route path="/" element={<Landing />} />
                            <Route path="/puzzles" element={<PuzzleList />} />
                            <Route path="/p/:ref" element={<Play />} />
                            <Route path="/new" element={<Author />} />
                            <Route path="/settings" element={<Settings />} />
                        </Routes>
                    </main>
                    <ToastViewport />
                </div>
            </PageHeaderContext.Provider>
        </PageActionsContext.Provider>
    );
}
