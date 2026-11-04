// Sets data-theme and data-palette before the first paint (see index.html).
// The React side is src/app/use_theme.ts and src/app/use_palette.ts.
(function () {
    try {
        var stored = localStorage.getItem("cpr:theme");
        var theme =
            stored === "light" || stored === "dark"
                ? stored
                : window.matchMedia("(prefers-color-scheme: dark)").matches
                  ? "dark"
                  : "light";
        document.documentElement.setAttribute("data-theme", theme);
        // Keep this list in step with PALETTES in src/app/use_palette.ts (a test checks it).
        var palette = localStorage.getItem("cpr:palette");
        if (/^(slate|sage|plum|classic)$/.test(palette)) {
            document.documentElement.setAttribute("data-palette", palette);
        }
    } catch (e) {
        // Storage or matchMedia is not available. The "light" attribute of index.html stands.
    }
})();
