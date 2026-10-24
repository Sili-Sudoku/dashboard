import { createContext, useContext, useEffect } from "react";

export interface PageHeader {
    title: string;
    description?: string;
    byline?: string;
}

const noop = () => undefined;

/** Default is a no-op, not undefined — lets usePageHeader be called by a page
 *  rendered without AppRouter around it (e.g. Play/Author's own tests render
 *  them standalone) without needing every call site to guard for a missing
 *  provider. */
export const PageHeaderContext = createContext<(header: PageHeader | null) => void>(noop);

/**
 * Registers this page's title/description to render in the navbar instead of
 * a large in-page heading — Play and Author's own h1+p blocks were costing a
 * few hundred px of vertical space that the live board could use instead.
 * Clears itself on unmount (or when `title` goes away, e.g. a puzzle ref that
 * failed to resolve) so navigating elsewhere doesn't leave a stale title in
 * the navbar.
 */
export const usePageHeader = (title: string | undefined, description?: string, byline?: string): void => {
    const setHeader = useContext(PageHeaderContext);
    useEffect(() => {
        if (!title) return;
        setHeader({ title, description, byline });
        return () => setHeader(null);
    }, [title, description, byline, setHeader]);
};

/**
 * The navbar's action-button slot (e.g. Play's View JSON/Share buttons) — a
 * DOM node, not state, because these are interactive elements with handlers,
 * not simple strings; portaling them there (see Play, which calls
 * `createPortal` against this) sidesteps re-running an effect with a
 * JSX-identity dependency on every render (which would loop: new element
 * reference -> effect fires -> setState -> re-render -> new element
 * reference -> ...). Default null so pages rendered without AppRouter around
 * them (tests) can fall back to rendering their actions inline instead.
 */
export const PageActionsContext = createContext<HTMLElement | null>(null);

export const usePageActionsSlot = (): HTMLElement | null => useContext(PageActionsContext);
