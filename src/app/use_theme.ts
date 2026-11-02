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
 * Follows the OS theme until the player picks a theme explicitly.
 * This matches the synchronous check in the inline script of index.html.
 * That script sets the attribute before the first paint, to prevent a flash of the wrong theme.
 * After the player picks a theme, the choice stays (localStorage) and no longer follows the OS.
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
            // Storage is unavailable (private mode and others). The choice is not persisted.
        }
    };

    return { theme, toggleTheme };
};
