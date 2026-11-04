import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Text and interactive colors must stay readable in every palette and theme (WCAG AA).
 * jsdom has no layout or cascade, so axe cannot check contrast (see a11y.test.tsx).
 * This test reads the tokens in style.css directly instead.
 */
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

const PALETTES = ["coffee", "slate", "sage", "plum", "classic"];
const THEMES = ["light", "dark"];

const tokens = (palette: string, theme: string): Record<string, string> => {
    const selectors = [`:root[data-theme="${theme}"]`];
    if (palette !== "coffee") selectors.push(`:root[data-palette="${palette}"][data-theme="${theme}"]`);
    const result: Record<string, string> = {};
    for (const selector of selectors) {
        const start = css.indexOf(`${selector} {`);
        if (start < 0) throw new Error(`No block for ${selector}`);
        const body = css.slice(start, css.indexOf("\n}", start));
        for (const [, name, value] of body.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) result[name] = value.trim();
    }
    return result;
};

const resolve = (all: Record<string, string>, name: string): string => {
    let value = all[name];
    for (let i = 0; i < 5 && value?.startsWith("var("); i++) value = all[value.slice(6, -1)];
    if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a hex color: ${value}`);
    return value;
};

const luminance = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a: string, b: string): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

/** [foreground, background, minimum ratio]. 4.5 is for text, 3 is for icons and large marks. */
const PAIRS: [string, string, number][] = [
    ["--ink", "--bg", 4.5],
    ["--ink", "--surface", 4.5],
    ["--ink-soft", "--bg", 4.5],
    ["--ink-soft", "--surface", 4.5],
    ["--brand", "--surface", 4.5],
    ["--brand", "--bg", 4.5],
    ["--on-brand", "--brand", 4.5],
    ["--entered", "--surface", 4.5],
    ["--given", "--surface", 4.5],
    ["--accent", "--bg", 4.5],
    ["--satisfied", "--surface", 4.5],
    ["--violated-line", "--violated", 3],
    ["--code-ink", "--code-bg", 4.5],
];

describe("contrast of the design tokens", () => {
    for (const palette of PALETTES) {
        for (const theme of THEMES) {
            it(`${palette} ${theme}`, () => {
                const all = tokens(palette, theme);
                const failures = PAIRS.flatMap(([fg, bg, min]) => {
                    const r = ratio(resolve(all, fg), resolve(all, bg));
                    return r < min ? [`${fg} on ${bg}: ${r.toFixed(2)} < ${min}`] : [];
                });
                expect(failures).toEqual([]);
            });
        }
    }
});
