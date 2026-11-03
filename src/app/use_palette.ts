import { useState } from "react";

/**
 * The look of the app, apart from light/dark (`use_theme.ts`).
 * "coffee" is the default coffee and cream look. "slate", "sage" and "plum" keep that look with another hue.
 * "classic" is a plain look with system fonts, white and black, and buttons that look like the buttons of the browser.
 * The CSS reads `data-palette` on the root element. The default value sets no attribute.
 * The inline script of index.html sets the attribute before the first paint.
 */
export const PALETTES = [
    { id: "coffee", label: "Coffee & cream" },
    { id: "slate", label: "Slate" },
    { id: "sage", label: "Sage" },
    { id: "plum", label: "Plum" },
    { id: "classic", label: "Classic" },
] as const;

export type Palette = (typeof PALETTES)[number]["id"];

const PALETTE_KEY = "cpr:palette";

export const readStoredPalette = (): Palette => {
    try {
        const raw = localStorage.getItem(PALETTE_KEY);
        return PALETTES.some((p) => p.id === raw) ? (raw as Palette) : "coffee";
    } catch {
        return "coffee";
    }
};

const applyPalette = (palette: Palette) => {
    if (palette === "coffee") document.documentElement.removeAttribute("data-palette");
    else document.documentElement.setAttribute("data-palette", palette);
};

export const usePalette = (): [Palette, (next: Palette) => void] => {
    const [palette, setPaletteState] = useState<Palette>(readStoredPalette);

    const setPalette = (next: Palette) => {
        setPaletteState(next);
        applyPalette(next);
        try {
            localStorage.setItem(PALETTE_KEY, next);
        } catch {
            // Storage is unavailable (private mode and others). The choice is not saved.
        }
    };

    return [palette, setPalette];
};
