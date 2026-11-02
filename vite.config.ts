/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import * as path from "node:path";

export default defineConfig({
    plugins: [
        react(),
        // Precaches the whole build (including lazy route chunks) so visited-once
        // or not, the app opens offline. The manifest is the hand-written one in
        // public/, so the plugin does not generate its own.
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
        // Default to node; component tests opt into jsdom with a
        // `// @vitest-environment jsdom` docblock at the top of the file.
        environment: "node",
        globals: true,
        include: ["src/**/*.test.{ts,tsx}"],
        coverage: {
            provider: "v8",
            include: ["src/**/*.{ts,tsx}"],
            exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.bench.ts", "src/main.tsx", "src/**/*.d.ts"],
            reporter: ["text-summary", "html"],
            reportsDirectory: "coverage",
            // A floor just under where coverage sits today (92/85/91 in Nov 2026):
            // not a target, a ratchet — it fails the run if coverage regresses
            // noticeably. Raise it when coverage rises.
            thresholds: { statements: 90, lines: 90, functions: 90, branches: 83 },
        },
    },
});
