import { createContext, useContext, useEffect } from "react";

export interface PageHeader {
    title: string;
    description?: string;
    byline?: string;
}

const noop = () => undefined;

/** The default is a no-op, not undefined.
 *  A page can call usePageHeader without AppRouter around it (for example the tests of Play and Author).
 *  Call sites do not need a guard for a missing provider. */
export const PageHeaderContext = createContext<(header: PageHeader | null) => void>(noop);

/**
 * Registers the title and description of this page. The navbar shows them instead of a large in-page heading.
 * The h1+p blocks of Play and Author used a few hundred px of vertical space that the live board can use.
 * The hook clears the header on unmount, or when `title` goes away (for example a puzzle ref that failed to resolve).
 * This way, navigation elsewhere does not leave a stale title in the navbar.
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
 * The action-button slot of the navbar (for example the View JSON/Share buttons of Play).
 * It is a DOM node, not state, because the buttons are interactive elements with handlers, not simple strings.
 * Play calls `createPortal` against this node.
 * This avoids an effect with a JSX-identity dependency that re-runs on every render.
 * That effect would loop: new element reference -> effect fires -> setState -> re-render -> new element reference.
 * The default is null.
 * A page rendered without AppRouter (tests) then renders its actions inline.
 */
export const PageActionsContext = createContext<HTMLElement | null>(null);

export const usePageActionsSlot = (): HTMLElement | null => useContext(PageActionsContext);
