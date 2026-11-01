/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "node:path";

export default defineConfig({
    plugins: [react()],
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
