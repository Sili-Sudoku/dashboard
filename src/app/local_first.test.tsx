// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AppRouter from "@/app/router.tsx";
import { ToastViewport } from "@/app/toast_viewport.tsx";
import { clearToasts } from "@/app/toast.ts";
import { encodePuzzle } from "@/runtime/serialization.ts";
import { firstPuzzle } from "@/puzzles/first_puzzle.ts";
import { miniSudoku } from "@/puzzles/mini_sudoku.ts";

/**
 * The local-first rule: solving, authoring, importing and `/p/<blob>` links work with no server at all.
 * A server may only ever be a convenience on top.
 * Here every way to reach the network fails loudly, and a flow only passes if it never even tries.
 */
const attempts: string[] = [];

const failing = (name: string) =>
    function () {
        attempts.push(name);
        throw new TypeError(`${name}: the network is down`);
    };

beforeEach(() => {
    attempts.length = 0;
    vi.stubGlobal("fetch", vi.fn(failing("fetch")));
    vi.stubGlobal("XMLHttpRequest", failing("XMLHttpRequest"));
    vi.stubGlobal("WebSocket", failing("WebSocket"));
    vi.stubGlobal("EventSource", failing("EventSource"));
    vi.stubGlobal("matchMedia", () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    }));
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    Object.defineProperty(navigator, "sendBeacon", { value: failing("sendBeacon"), configurable: true });
    localStorage.setItem("cpr:settings", JSON.stringify({ authorEditorMode: "json", playHintSeen: true }));
});

afterEach(() => {
    cleanup();
    clearToasts();
    localStorage.clear();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "sendBeacon");
    Reflect.deleteProperty(navigator, "onLine");
});

const openApp = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <AppRouter />
            <ToastViewport />
        </MemoryRouter>,
    );

describe("local-first: nothing needs a server", () => {
    it("opens a /p/<blob> link and solves the puzzle by keyboard", async () => {
        const { container } = openApp(`/p/${encodePuzzle(miniSudoku)}`);
        await screen.findByRole("button", { name: "Puzzle actions" });
        const board = container.querySelector<SVGElement>(".play .board")!;

        const solution = miniSudoku.solution as Record<string, number>;
        const given = miniSudoku.givens ?? {};
        const press = (key: string, code = key) => fireEvent.keyDown(board, { key, code });
        for (let row = 1; row <= 4; row++) {
            for (let col = 1; col <= 4; col++) {
                const cell = `r${row}c${col}`;
                if (!(cell in given)) press(String(solution[cell]), `Digit${solution[cell]}`);
                if (col < 4) press("ArrowRight");
            }
            if (row < 4) for (let i = 0; i < 3; i++) press("ArrowLeft");
            if (row < 4) press("ArrowDown");
        }
        expect(await screen.findByRole("dialog", { name: "Solved!" })).toBeTruthy();
        expect(attempts).toEqual([]);
    });

    it("shows the puzzle list and a built-in puzzle", async () => {
        openApp("/puzzles");
        await screen.findByRole("heading", { name: "Puzzles" });
        cleanup();
        openApp("/p/first-puzzle");
        await screen.findByRole("button", { name: "Puzzle actions" });
        expect(attempts).toEqual([]);
    });

    it("authors a puzzle: edits it, loads an example, checks it and copies a share link", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
        const { container } = openApp("/new");
        const textarea = await screen.findByRole("textbox");

        fireEvent.change(textarea, { target: { value: JSON.stringify(firstPuzzle) } });
        expect(container.querySelector(".author-error")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: /check uniqueness/i }));
        expect((await screen.findAllByText(/unique solution/i)).length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole("button", { name: /copy share link/i }));
        await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/p/")));

        fireEvent.click(screen.getByRole("button", { name: /load an example/i }));
        fireEvent.click(screen.getByRole("menuitem", { name: /mini sudoku/i }));
        expect(JSON.parse((screen.getByRole("textbox") as HTMLTextAreaElement).value).metadata.id).toBe("mini-sudoku");
        expect(attempts).toEqual([]);
    });

    it("imports f-puzzles JSON pasted into the app", async () => {
        const fpuzzles = JSON.stringify({
            size: 4,
            grid: Array.from({ length: 4 }, (_, r) =>
                Array.from({ length: 4 }, (_, c) => ({ region: Math.floor(r / 2) * 2 + Math.floor(c / 2) })),
            ),
            title: "Imported offline",
        });
        openApp("/new");
        await screen.findByRole("textbox");
        fireEvent.click(screen.getByRole("button", { name: /import \/ export/i }));
        fireEvent.click(screen.getByRole("menuitem", { name: /import from f-puzzles/i }));
        fireEvent.change(screen.getByPlaceholderText(/paste f-puzzles json/i), { target: { value: fpuzzles } });
        fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
        expect(JSON.parse((screen.getByRole("textbox") as HTMLTextAreaElement).value).metadata.title).toBe(
            "Imported offline",
        );
        expect(attempts).toEqual([]);
    });

    it("keeps settings in the browser", async () => {
        openApp("/settings");
        await screen.findByRole("heading", { name: "Settings" });
        expect(attempts).toEqual([]);
    });
});

/**
 * The runtime check above only covers what the flows reach. This one covers all of the source:
 * no file may use an API that talks to a server. If one ever must, it is a decision to make on purpose.
 * Add it to ALLOWED with the reason, and say in the review why the app still works without it.
 */
describe("local-first: no code in the app talks to a server", () => {
    const NETWORK_APIS = /\bfetch\s*\(|\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b/;
    /** File -> why it may. Empty: nothing in the app reaches a server. */
    const ALLOWED: Record<string, string> = {};

    const sources = (dir: string): string[] =>
        readdirSync(dir).flatMap((name) => {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) return sources(path);
            return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
        });

    it("finds no network API in src", () => {
        const root = join(process.cwd(), "src");
        const offenders = sources(root)
            .map((path) => path.slice(root.length + 1))
            .filter((file) => !(file in ALLOWED))
            .filter((file) => NETWORK_APIS.test(readFileSync(join(root, file), "utf8")));
        expect(offenders).toEqual([]);
    });
});
