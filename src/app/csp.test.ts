import { describe, expect, it } from "vitest";

import headers from "../../public/_headers?raw";

const policy = /Content-Security-Policy:\s*(.+)/.exec(headers)?.[1] ?? "";
const directive = (name: string) =>
    policy
        .split(";")
        .find((d) => d.trim().startsWith(`${name} `))
        ?.trim();

describe("Content-Security-Policy of public/_headers", () => {
    it("allows only the own origin by default", () => {
        expect(directive("default-src")).toBe("default-src 'self'");
        expect(directive("object-src")).toBe("object-src 'none'");
        expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
        expect(directive("connect-src")).toBe("connect-src 'self'");
    });

    it("allows no inline script, no inline style and no eval", () => {
        expect(policy).not.toContain("unsafe-inline");
        expect(policy).not.toContain("unsafe-eval");
    });

    it("allows scripts from the site only, with no eval and no inline script", () => {
        expect(directive("script-src")).toBe("script-src 'self'");
    });

    it("allows images only from the site and data: URLs (the rule of the puzzle format)", () => {
        expect(directive("img-src")).toBe("img-src 'self' data:");
    });
});
