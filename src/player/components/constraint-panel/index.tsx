import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, CircleAlert, CircleDashed, ListChecks } from "lucide-react";

import type { ConstraintEvaluation, EvaluationResult } from "@/runtime/evaluate.ts";

import "./style.css";

interface Props {
    evaluation: EvaluationResult;
}

interface SourceGroup {
    source: string;
    satisfied: number;
    incomplete: number;
    violated: number;
    items: ConstraintEvaluation[];
}

export default function ConstraintPanel({ evaluation }: Props) {
    const groups = useMemo(() => groupBySource(evaluation.constraints), [evaluation]);
    // The whole panel is collapsed to just its toggle button by default — this
    // *is* the "Show/Hide constraints" control now, not a separate button that
    // sits above a second collapsible section.
    const [open, setOpen] = useState(false);
    // Per-group collapse, independent of the panel-level toggle above.
    // Collapsed by default — tracking which groups were opened (rather than
    // which were closed) means a group newly appearing in `groups` starts
    // collapsed without needing to know the full source list upfront.
    const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set());

    const toggleGroup = (source: string) =>
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(source)) next.delete(source);
            else next.add(source);
            return next;
        });

    // While open, the toggle button doubles as the status line — no separate
    // "Hide constraints" row above an "In progress — n/m cells" row, just one.
    const label = open
        ? evaluation.complete
            ? "Solved — every constraint satisfied"
            : evaluation.status === "invalid"
              ? "Some constraints are broken"
              : `In progress — ${evaluation.filledCount}/${evaluation.cellCount} cells`
        : "Show constraints";

    return (
        <section className={`constraint-panel ${open ? "cp-open" : ""}`}>
            <button
                type="button"
                className={`pp-toggle cp-toggle ${open ? `cp-${evaluation.status}` : ""}`}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            >
                <ListChecks size={15} /> {label}
            </button>

            {open && (
                <>
                    <ul className="cp-groups">
                        {groups.map((g) => {
                            const isCollapsed = !expandedGroups.has(g.source);
                            return (
                                <li key={g.source} className="cp-group">
                                    <button
                                        type="button"
                                        className="cp-group-head"
                                        aria-expanded={!isCollapsed}
                                        onClick={() => toggleGroup(g.source)}
                                    >
                                        <span className="cp-group-label">
                                            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                            <span className="cp-source">{g.source}</span>
                                        </span>
                                        <span className="cp-counts">
                                            {g.violated > 0 && <em className="bad">{g.violated} broken</em>}
                                            {g.incomplete > 0 && <em className="pending">{g.incomplete} pending</em>}
                                            {g.violated === 0 && g.incomplete === 0 && (
                                                <em className="ok">all satisfied</em>
                                            )}
                                        </span>
                                    </button>
                                    {!isCollapsed && (
                                        <ul className="cp-items">
                                            {g.items.map((item) => (
                                                <li key={item.id} className={`cp-item cp-${item.status}`}>
                                                    <StatusIcon status={item.status} />
                                                    <span>{item.label ?? item.id}</span>
                                                    {item.error && <span className="cp-error">{item.error}</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </section>
    );
}

function StatusIcon({ status }: { status: ConstraintEvaluation["status"] }) {
    if (status === "satisfied") return <Check size={14} className="ok" />;
    if (status === "violated") return <CircleAlert size={14} className="bad" />;
    return <CircleDashed size={14} className="pending" />;
}

const groupBySource = (constraints: readonly ConstraintEvaluation[]): SourceGroup[] => {
    const map = new Map<string, SourceGroup>();
    for (const c of constraints) {
        let group = map.get(c.source);
        if (!group) {
            group = { source: c.source, satisfied: 0, incomplete: 0, violated: 0, items: [] };
            map.set(c.source, group);
        }
        group.items.push(c);
        if (c.status === "satisfied") group.satisfied++;
        else if (c.status === "violated") group.violated++;
        else group.incomplete++;
    }
    return [...map.values()];
};
