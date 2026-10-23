import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "cpr:theme";

const readStoredTheme = (): Theme | null => {
    try {
        const raw = localStorage.getItem(THEME_KEY);
        return raw === "light" || raw === "dark" ? raw : null;
    } catch {
        return null;
    }
};

const systemTheme = (): Theme => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/**
 * Mirrors the OS theme until the player picks one explicitly (matching the
 * synchronous check in index.html's inline script, which sets the attribute
 * before first paint to avoid a flash of the wrong theme) — once they do,
 * that choice sticks (localStorage) and no longer follows the OS.
 */
export const useTheme = (): { theme: Theme; toggleTheme: () => void } => {
    const [theme, setThemeState] = useState<Theme>(() => readStoredTheme() ?? systemTheme());

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
    }, [theme]);

    useEffect(() => {
        if (readStoredTheme()) return; // the player already made an explicit choice

        const mql = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => setThemeState(mql.matches ? "dark" : "light");
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, []);

    const toggleTheme = () => {
        const next: Theme = theme === "dark" ? "light" : "dark";
        setThemeState(next);
        try {
            localStorage.setItem(THEME_KEY, next);
        } catch {
            // storage unavailable (private mode etc.) — choice just isn't persisted
        }
    };

    return { theme, toggleTheme };
};
