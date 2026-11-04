/**
 * The `metadata.source` of a puzzle is a link that the app shows to the player.
 * Only https links are accepted. A `javascript:` or `data:` link would run code when it is followed,
 * and a plain http link can be changed on the way.
 */

/** The link as a URL, or undefined when it is not an https link. */
export const parseSourceUrl = (source: string): URL | undefined => {
    let url: URL;
    try {
        url = new URL(source);
    } catch {
        return undefined;
    }
    return url.protocol === "https:" ? url : undefined;
};

const MAX_HOST_CHARS = 30;

/** The name of the site, for a label: "https://www.example.com/a/b" -> "example.com". A long name is cut short. */
export const sourceHost = (source: string): string | undefined => {
    const host = parseSourceUrl(source)?.hostname.replace(/^www\./, "");
    if (host === undefined || host.length <= MAX_HOST_CHARS) return host;
    return `${host.slice(0, MAX_HOST_CHARS - 1)}…`;
};
