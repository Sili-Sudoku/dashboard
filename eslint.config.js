import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
    globalIgnores(["dist", "coverage"]),
    {
        files: ["**/*.{ts,tsx}"],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommendedTypeChecked,
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
        ],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.browser,
            parserOptions: {
                project: ["./tsconfig.app.json", "./tsconfig.node.json"],
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        // Tests read untyped JSON, build code with `new Function`, and call React's `act()` (it returns a thenable
        // even for a sync callback). The type-aware rules about those give noise there, and only there.
        files: ["**/*.test.{ts,tsx}"],
        rules: {
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/no-implied-eval": "off",
            "@typescript-eslint/no-floating-promises": "off",
            "@typescript-eslint/no-unnecessary-type-assertion": "off",
        },
    },
    {
        files: ["**/*.test.{ts,tsx}", "**/*.config.{ts,js}"],
        rules: {
            "react-refresh/only-export-components": "off",
        },
    },
]);
