/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Plugin } from "vite";

const NOTICES_FILE = "third-party-notices.txt";

/**
 * Builds the licence notices of the shipped packages from the lockfile, so there is no second package
 * list to maintain. MIT and ISC ask for the copyright notice to stay with the code, and the minified
 * bundle has none. The file is served at /third-party-notices.txt.
 */
function thirdPartyNotices(): Plugin {
    const build = (): string => {
        const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8")) as {
            packages: Record<string, { version?: string; license?: string; dev?: boolean }>;
        };
        const parts = Object.entries(lock.packages)
            .filter(([key, info]) => key !== "" && !info.dev)
            .map(([key, info]) => {
                const dir = key;
                const file = fs.readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
                const text = file
                    ? fs.readFileSync(path.join(dir, file), "utf8").trim()
                    : "(no licence file in package)";
                return `${dir.replace(/^node_modules\//, "")} ${info.version ?? ""} (${info.license ?? "unknown"})\n\n${text}`;
            });
        return `Third-party software shipped with this app\n\n${parts.join("\n\n----------------------------------------\n\n")}\n`;
    };
    return {
        name: "third-party-notices",
        generateBundle() {
            this.emitFile({ type: "asset", fileName: NOTICES_FILE, source: build() });
        },
        configureServer(server) {
            server.middlewares.use(`/${NOTICES_FILE}`, (_req, res) => {
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.end(build());
            });
        },
    };
}

/**
 * GitHub Pages cannot send headers, so public/_headers has no effect there. This copies its policy into a meta tag
 * of the built index.html, so there is one policy to maintain. `frame-ancestors` is dropped, because browsers ignore
 * it in a meta tag. Build only: the dev server needs inline scripts for hot reload.
 */
function cspMeta(): Plugin {
    return {
        name: "csp-meta",
        apply: "build",
        transformIndexHtml() {
            const headers = fs.readFileSync("public/_headers", "utf8");
            const policy = /Content-Security-Policy:\s*(.+)/.exec(headers)?.[1];
            if (!policy) throw new Error("public/_headers has no Content-Security-Policy");
            const content = policy
                .split(";")
                .map((d) => d.trim())
                .filter((d) => d && !d.startsWith("frame-ancestors"))
                .join("; ");
            return [
                {
                    tag: "meta",
                    attrs: { "http-equiv": "Content-Security-Policy", content },
                    injectTo: "head-prepend",
                },
            ];
        },
    };
}

export default defineConfig({
    plugins: [
        react(),
        thirdPartyNotices(),
        cspMeta(),
        // Precaches the whole build, including lazy route chunks. The app opens offline, even for
        // routes the user did not visit. The manifest is the hand-written one in public/, so the
        // plugin does not generate its own.
        VitePWA({
            registerType: "autoUpdate",
            manifest: false,
            workbox: {
                globPatterns: ["**/*.{js,css,html,svg,webmanifest}"],
                navigateFallback: "/index.html",
            },
        }),
    ],
    base: "/",
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    test: {
        // Default to node. Component tests use jsdom with a `// @vitest-environment jsdom` docblock at
        // the top of the file.
        environment: "node",
        globals: true,
        include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
        coverage: {
            provider: "v8",
            include: ["src/**/*.{ts,tsx}"],
            exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.bench.ts", "src/main.tsx", "src/**/*.d.ts"],
            reporter: ["text-summary", "html"],
            reportsDirectory: "coverage",
            // A floor just under the current coverage (92/85/91 in Nov 2026). It is a ratchet, not a
            // target. The run fails if coverage drops noticeably. Raise it when coverage rises.
            thresholds: { statements: 90, lines: 90, functions: 90, branches: 83 },
        },
    },
});
