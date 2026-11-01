/**
 * A small static picture of a puzzle — what a published puzzle stores at
 * creation so link previews (Open Graph cards) don't depend on running the
 * app. Pure SVG-string generation (testable anywhere) plus a browser-only PNG
 * rasteriser.
 *
 * Reuses the live board's own drawing (`ShapeNode`, `buildScene`) so the two
 * can't drift. What it can't reuse is the board's theme: an SVG rasterised on
 * its own has no page CSS, so every `var(--token)` is resolved against the
 * fixed light palette below — thumbnails look the same whatever theme the
 * creator happened to be using. Shows the starting position only (givens,
 * fog still covering), never the solution or anyone's entries.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { evaluate } from "@/runtime/evaluate.ts";
import type { CompiledPuzzle } from "@/runtime/puzzle.ts";
import { buildScene } from "@/renderer/scene.ts";
import ShapeNode from "@/renderer/ShapeNode.tsx";

/** Mirrors the light theme in style.css. thumbnail.test.ts fails if a constraint graphic uses a token missing here. */
export const THUMBNAIL_PALETTE: Readonly<Record<string, string>> = {
    bg: "#f6efe0",
    surface: "#fbf6ea",
    ink: "#211a10",
    "ink-soft": "#6b5c40",
    line: "#cdbb8d",
    "line-strong": "#211a10",
    brand: "#2f4b8c",
    given: "#211a10",
    entered: "#2f4b8c",
    violated: "#f6d5c8",
    "violated-line": "#b8321f",
    invalid: "#efb9a8",
    fog: "#d9ceb0",
    "fog-line": "#b3a275",
    thermo: "#a89c80",
    cage: "#3c6e52",
    arrow: "#4a3c28",
    palindrome: "#9a4f7d",
    betweenline: "#4f6aa8",
    diagonal: "#d1b27a",
};

/** Replaces `var(--token)` with its palette value; an unknown token is left as-is (and caught by the test). */
const resolveTokens = (markup: string, palette: Readonly<Record<string, string>>): string =>
    markup.replace(/var\(--([a-z-]+)\)/g, (whole, name: string) => palette[name] ?? whole);

export const renderThumbnailSvg = (puzzle: CompiledPuzzle, palette = THUMBNAIL_PALETTE): string => {
    const hidden = new Set(puzzle.fog?.hidden ?? []);
    const scene = buildScene({
        puzzle,
        valueOf: (c) => (hidden.has(c) ? null : (puzzle.givens[c] ?? null)),
        notesOf: () => [],
        centerNotesOf: () => [],
        flaggedCells: new Set(),
        incorrectCells: new Set(),
        isGiven: (c) => c in puzzle.givens,
        selection: new Set(),
        cursor: null,
        evaluation: evaluate(puzzle, () => null),
        hiddenCells: hidden,
    });

    const grid = scene.gridLines
        .map(
            (l) =>
                `<line x1="${l.points[0].x}" y1="${l.points[0].y}" x2="${l.points[1].x}" y2="${l.points[1].y}" ` +
                `stroke="var(--${l.weight >= 3 ? "line-strong" : "line"})" stroke-width="${l.weight}"/>`,
        )
        .join("");
    const shapes = renderToStaticMarkup(
        createElement(
            "g",
            null,
            scene.shapes.map((shape, i) => createElement(ShapeNode, { key: i, shape })),
        ),
    );
    const fog = scene.cells
        .filter((c) => c.hidden)
        .map(
            (c) =>
                `<rect x="${c.x}" y="${c.y}" width="${c.size}" height="${c.size}" fill="var(--fog)" stroke="var(--fog-line)"/>`,
        )
        .join("");
    const digits = scene.cells
        .filter((c) => c.value !== null)
        .map(
            (c) =>
                `<text x="${c.x + c.size / 2}" y="${c.y + c.size / 2}" font-size="${c.size * 0.62}" font-weight="600" ` +
                `text-anchor="middle" dominant-baseline="central" fill="var(--given)">${c.value}</text>`,
        )
        .join("");

    // Same layer order as Board: grid, constraint graphics, fog cover, digits.
    const body =
        `<rect width="${scene.width}" height="${scene.height}" fill="var(--surface)"/>` + grid + shapes + fog + digits;
    return resolveTokens(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${scene.viewBox}" width="${scene.width}" height="${scene.height}" ` +
            `font-family="Georgia, 'Times New Roman', serif">${body}</svg>`,
        palette,
    );
};

/** Browser-only: rasterises the thumbnail to a PNG whose longer side is `size` px (aspect ratio kept). */
export const renderThumbnailPng = async (puzzle: CompiledPuzzle, size = 480): Promise<Blob> => {
    const url = URL.createObjectURL(new Blob([renderThumbnailSvg(puzzle)], { type: "image/svg+xml" }));
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        const scale = size / Math.max(image.naturalWidth, image.naturalHeight);
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas 2D context unavailable");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png"),
        );
    } finally {
        URL.revokeObjectURL(url);
    }
};
