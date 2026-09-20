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
    },
});
