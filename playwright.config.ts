import { defineConfig, devices } from "@playwright/test";

// Runs against the production build, because the service worker only exists there.
export default defineConfig({
    // The specs import fixtures from src/, which use the @/ alias.
    tsconfig: "./tsconfig.app.json",
    testDir: "e2e",
    use: { baseURL: "http://localhost:4199" },
    webServer: {
        command: "npm run build && npx vite preview --port 4199 --strictPort",
        url: "http://localhost:4199",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
