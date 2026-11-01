import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";

import "./overflow_menu.css";

export interface MenuItem {
    label: string;
    icon?: ReactNode;
    onSelect: () => void;
    /** A read-only line (e.g. the timer): shown in the list but not actionable. */
    info?: boolean;
    /** Destructive: the first activation only arms the item ("Really …?"); a second one runs it. */
    confirm?: string;
}

interface Props {
    /** Accessible name of the trigger button. */
    label: string;
    items: readonly MenuItem[];
    /** Which edge of the trigger the menu lines up with. */
    align?: "start" | "end";
    /** Open upward (for triggers near the bottom of the screen). */
    up?: boolean;
    /** Visible text for the trigger (e.g. "Import / Export"); without it the trigger is a bare "⋯". */
    text?: string;
    /** A low-emphasis trigger (ghost, small) for menus that sit among heavier buttons. */
    quiet?: boolean;
    /** The thin-outline button (.btn-flat) instead of the stamp, for menus beside other flat controls. */
    flat?: boolean;
}

/** A "⋯" button and its popup list: the home for anything that is not a primary or
 *  frequent action. Closes on Escape, outside press, or choosing an item. */
export function OverflowMenu({ label, items, align = "end", up = false, text, quiet = false, flat = false }: Props) {
    const [open, setOpen] = useState(false);
    const [armed, setArmed] = useState<number | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const menuId = useId();

    const close = (refocus: boolean) => {
        setOpen(false);
        setArmed(null);
        if (refocus) triggerRef.current?.focus();
    };

    useEffect(() => {
        if (!open) return;
        const onPress = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) {
                setOpen(false);
                setArmed(null);
            }
        };
        document.addEventListener("pointerdown", onPress);
        return () => document.removeEventListener("pointerdown", onPress);
    }, [open]);

    // Keep the popup on screen whatever the trigger's position or the window size: flip to the
    // other side of the trigger when it would run off the top/bottom, and slide sideways when it
    // would run off an edge. Done on the DOM node directly (measured after layout, before paint).
    useLayoutEffect(() => {
        const list = listRef.current;
        if (!open || !list) return;
        const MARGIN = 8;
        const trigger = triggerRef.current?.getBoundingClientRect();
        list.style.transform = "";
        list.style.top = "";
        list.style.bottom = "";
        let rect = list.getBoundingClientRect();
        if (trigger && (rect.top < MARGIN || rect.bottom > window.innerHeight - MARGIN)) {
            const roomAbove = trigger.top - MARGIN;
            const roomBelow = window.innerHeight - trigger.bottom - MARGIN;
            const goUp = roomAbove > roomBelow;
            list.style.top = goUp ? "auto" : "calc(100% + 0.4rem)";
            list.style.bottom = goUp ? "calc(100% + 0.4rem)" : "auto";
            // Taller than either side: cap it and let it scroll.
            list.style.maxHeight = `${Math.max(goUp ? roomAbove : roomBelow, 88) - 6}px`;
            list.style.overflowY = "auto";
            rect = list.getBoundingClientRect();
        }
        const dx = rect.left < MARGIN ? MARGIN - rect.left : Math.min(0, window.innerWidth - MARGIN - rect.right);
        if (dx) list.style.transform = `translateX(${dx}px)`;
    }, [open]);

    useEffect(() => {
        if (open) rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled])')?.focus();
    }, [open]);

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            close(true);
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            const entries = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled])')];
            if (entries.length === 0) return;
            e.preventDefault();
            const at = entries.indexOf(document.activeElement as HTMLElement);
            const step = e.key === "ArrowDown" ? 1 : -1;
            entries[(at + step + entries.length) % entries.length].focus();
        }
    };

    return (
        <div className="overflow-menu" ref={rootRef} onKeyDown={onKeyDown}>
            <button
                ref={triggerRef}
                type="button"
                className={`btn overflow-menu-trigger${text ? "" : " btn-icon"}${quiet ? " btn-ghost btn-sm" : ""}${flat ? " btn-flat" : ""}`}
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                onClick={() => (open ? close(false) : setOpen(true))}
            >
                {text && <span>{text}</span>}
                {text ? <ChevronDown size={16} /> : <MoreHorizontal size={18} />}
            </button>
            {open && (
                <div
                    id={menuId}
                    ref={listRef}
                    role="menu"
                    aria-label={label}
                    className={`overflow-menu-list overflow-menu-${align}${up ? " overflow-menu-up" : ""}`}
                >
                    {items.map((item, i) => {
                        const isArmed = armed === i;
                        return (
                            <button
                                key={item.label}
                                type="button"
                                role="menuitem"
                                aria-disabled={item.info || undefined}
                                tabIndex={item.info ? -1 : undefined}
                                className={`overflow-menu-item${isArmed ? " is-armed" : ""}${item.info ? " is-info" : ""}${item.confirm ? " is-destructive" : ""}`}
                                onClick={() => {
                                    if (item.info) return;
                                    if (item.confirm && !isArmed) {
                                        setArmed(i);
                                        return;
                                    }
                                    close(true);
                                    item.onSelect();
                                }}
                            >
                                {item.icon}
                                {isArmed ? item.confirm : item.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
