import { lazy, Suspense, useEffect, useState } from "react";
import { Moon, Settings as SettingsIcon, Sun } from "lucide-react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import Landing from "@/features/landing";
import { PageLoader } from "@/app/page_loader.tsx";
import { ErrorBoundary } from "@/app/error_boundary.tsx";
import NotFound from "@/app/not_found.tsx";
import { ToastViewport } from "@/app/toast_viewport.tsx";
import { useTheme } from "@/app/use_theme.ts";
import { PageActionsContext, PageHeaderContext, type PageHeader } from "@/app/page_header.ts";

// Landing stays in the main bundle. It is the first page most visitors see.
// All other pages load on navigation.
// This way, the solver/renderer of Play and the visual builder and interop code of Author
// do not add weight to the landing page.
const PuzzleList = lazy(() => import("@/features/puzzles"));
const Play = lazy(() => import("@/features/play"));
const Author = lazy(() => import("@/features/author"));
const Settings = lazy(() => import("@/features/settings"));

const APP_TITLE = "Constraint Puzzle Runtime";

// Titles for routes that do not register their own title with usePageHeader.
// Play and Author register their own, and their title has priority.
// "/" and a puzzle that is not yet loaded use the bare app title.
const ROUTE_TITLES: Record<string, string> = {
    "/puzzles": "Puzzles",
    "/new": "Author a puzzle",
    "/settings": "Settings",
};
const KNOWN_PATHS = new Set(["/", ...Object.keys(ROUTE_TITLES)]);

export default function AppRouter() {
    const { theme, toggleTheme } = useTheme();
    const [pageHeader, setPageHeader] = useState<PageHeader | null>(null);
    // Passing the setter of useState directly to `ref` is the standard way to wait for a DOM node
    // and then re-render with it.
    // React calls the setter with the element on mount and unmount.
    // So the View JSON/Share buttons of Play can portal into the element when it exists.
    // They do not render their own row at the top of the page.
    const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
    // Play and Author both render a live puzzle board.
    // The board of Author is the embedded preview next to the JSON editor.
    // Both pages want the layout that fills the viewport (the flex-fill chain of board.css/player.css).
    // The default is a centered column.
    // The route drives this choice directly. A CSS :has(.board-wrap) structural match is not used.
    // That match depends on :has() support.
    // Without that support it does nothing and gives no error. The centered layout is the fallback.
    const { pathname, key } = useLocation();
    const navigate = useNavigate();
    const isBoardRoute = pathname.startsWith("/p/") || pathname === "/new";
    // The landing page has its own full-bleed sections (hero/manifesto/closer bands).
    // They have their own palette and padding.
    // The centered 1100px column below is for the working pages of the app, not for this page.
    const isLandingRoute = pathname === "/";

    const routeTitle =
        pageHeader?.title ??
        ROUTE_TITLES[pathname] ??
        (KNOWN_PATHS.has(pathname) || pathname.startsWith("/p/") ? undefined : "Page not found");
    useEffect(() => {
        document.title = routeTitle ? `${routeTitle} · ${APP_TITLE}` : APP_TITLE;
    }, [routeTitle]);

    return (
        <PageActionsContext.Provider value={actionsSlot}>
            <PageHeaderContext.Provider value={setPageHeader}>
                <div className={`app${isBoardRoute ? " app--board" : ""}`}>
                    <header className="app-header">
                        <div className="app-header-title">
                            <Link to="/" className="logo">
                                Constraint Puzzle Runtime
                            </Link>
                            {/* Play and Author register their own title here with usePageHeader.
                                They do not render a big in-page h1+p.
                                The description (when there is one) is a native hover tooltip.
                                It does not use another line.
                                Routes that set no title (Home) use the tagline. */}
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
                                <span className="tagline">
                                    Puzzle types are definitions. They are not engine features.
                                </span>
                            )}
                        </div>
                        {/* Play portals its View JSON/Share buttons in here (see page_header.ts).
                            It does not render its own row. */}
                        <span className="app-header-actions" ref={setActionsSlot} />
                        <nav>
                            <NavLink to="/puzzles">Puzzles</NavLink>
                            <NavLink to="/new">Author</NavLink>
                            {/* On the settings page the gear is a way back (key "default" = no in-app history). */}
                            {pathname === "/settings" ? (
                                <button
                                    type="button"
                                    className="btn btn-sm"
                                    aria-current="page"
                                    aria-label="Close settings"
                                    onClick={() => void (key === "default" ? navigate("/") : navigate(-1))}
                                >
                                    <SettingsIcon size={16} />
                                </button>
                            ) : (
                                <NavLink to="/settings" className="btn btn-sm" aria-label="Settings">
                                    <SettingsIcon size={16} />
                                </NavLink>
                            )}
                            <button
                                type="button"
                                className="btn btn-sm"
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
                        <ErrorBoundary key={pathname}>
                            <Suspense fallback={<PageLoader />}>
                                <Routes>
                                    <Route path="/" element={<Landing />} />
                                    <Route path="/puzzles" element={<PuzzleList />} />
                                    <Route path="/p/:ref" element={<Play />} />
                                    <Route path="/new" element={<Author />} />
                                    <Route path="/settings" element={<Settings />} />
                                    <Route path="*" element={<NotFound />} />
                                </Routes>
                            </Suspense>
                        </ErrorBoundary>
                    </main>
                    <ToastViewport />
                </div>
            </PageHeaderContext.Provider>
        </PageActionsContext.Provider>
    );
}
