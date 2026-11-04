import { describe, expect, it } from "vitest";

import { parseSourceUrl, sourceHost } from "@/runtime/source_link.ts";

describe("parseSourceUrl", () => {
    it("accepts https links", () => {
        expect(parseSourceUrl("https://example.com/puzzle/1")?.href).toBe("https://example.com/puzzle/1");
    });
    it("rejects plain http, which can be changed on the way", () => {
        expect(parseSourceUrl("http://example.com")).toBeUndefined();
    });
    it("rejects every other kind of link, because following it could run code or leak a file", () => {
        for (const bad of [
            "javascript:alert(1)",
            "JaVaScRiPt:alert(1)",
            "data:text/html,<script>1</script>",
            "file:///etc/passwd",
            "ftp://example.com",
            "blob:https://example.com/x",
        ]) {
            expect(parseSourceUrl(bad)).toBeUndefined();
        }
    });
    it("rejects text that is not a link", () => {
        expect(parseSourceUrl("")).toBeUndefined();
        expect(parseSourceUrl("example.com")).toBeUndefined();
        expect(parseSourceUrl("not a url")).toBeUndefined();
    });
});

describe("sourceHost", () => {
    it("names the site without www", () => {
        expect(sourceHost("https://www.example.com/a/b?c=1")).toBe("example.com");
        expect(sourceHost("https://puzzles.example.org/")).toBe("puzzles.example.org");
    });
    it("cuts a long name short", () => {
        const host = "a-very-long-subdomain-name.another-long-label.example.com";
        const short = sourceHost(`https://${host}/`)!;
        expect(short.length).toBe(30);
        expect(short.endsWith("…")).toBe(true);
        expect(host.startsWith(short.slice(0, -1))).toBe(true);
    });
    it("keeps a name of exactly the limit whole", () => {
        const host = `${"a".repeat(26)}.com`;
        expect(sourceHost(`https://${host}`)).toBe(host);
    });
    it("shows an address with login details or a lookalike by its real host", () => {
        expect(sourceHost("https://trusted.com@evil.example/x")).toBe("evil.example");
    });
    it("has no name for a link that is not accepted", () => {
        expect(sourceHost("javascript:alert(1)")).toBeUndefined();
    });
});
