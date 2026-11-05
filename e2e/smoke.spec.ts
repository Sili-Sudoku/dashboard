import { expect, test } from "@playwright/test";

import { miniSudoku } from "../src/puzzles/mini_sudoku.ts";

// What the jsdom tests cannot see: real layout, SVG, touch size and the service worker.

test("the landing page loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /solve variant sudoku/i })).toBeVisible();
    expect(errors).toEqual([]);
});

test("the mini sudoku is solved with the keyboard", async ({ page }) => {
    await page.goto("/p/mini-sudoku");
    const board = page.locator(".play .board");
    await expect(board).toBeFocused();
    const box = await board.boundingBox();
    expect(box!.width).toBeGreaterThan(150);
    expect(box!.height).toBeGreaterThan(150);

    const givens = miniSudoku.givens ?? {};
    const solution = miniSudoku.solution as Record<string, number>;
    for (let row = 1; row <= 4; row++) {
        for (let col = 1; col <= 4; col++) {
            const cell = `r${row}c${col}`;
            if (!(cell in givens)) await page.keyboard.press(String(solution[cell]));
            if (col < 4) await page.keyboard.press("ArrowRight");
        }
        if (row < 4) for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
        if (row < 4) await page.keyboard.press("ArrowDown");
    }
    await expect(page.getByRole("dialog", { name: "Solved!" })).toBeVisible();
});

test("the board fits a phone screen without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto("/p/demo-mixed");
    const board = page.locator(".play .board");
    await expect(board).toBeVisible();
    const box = (await board.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("the app opens offline after the first visit", async ({ page, context }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    // Wait for the worker to control the page, so the next load comes from its cache.
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.goto("/puzzles");
    await expect(page.getByRole("heading", { name: /puzzles/i }).first()).toBeVisible();
});
