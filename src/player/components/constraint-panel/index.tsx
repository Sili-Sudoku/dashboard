import { useMemo, useState } from "react";
import { BookOpen, Check, ChevronDown, ChevronRight, CircleAlert, CircleDashed } from "lucide-react";

import { useSettings } from "@/app/use_settings.ts";
import { definitions } from "@/definitions/index.ts";
import type { CellId } from "@/runtime/geometry.ts";
import type { ConstraintEvaluation, EvaluationResult } from "@/runtime/evaluate.ts";

import "./style.css";

interface Props {
    evaluation: EvaluationResult;
    /** The description of the puzzle, shown above the rules. */
    description?: string;
    /** The board's selected cells: constraints covering all of them are highlighted below. */
    selection?: ReadonlySet<CellId>;
}

interface SourceGroup {
    source: string;
    satisfied: number;
    incomplete: number;
    violated: number;
    items: ConstraintEvaluation[];
}

export default function ConstraintPanel({ evaluation, description, selection }: Props) {
    const groups = useMemo(() => groupBySource(evaluation.constraints), [evaluation]);
    // This panel is the rules of the puzzle: the description, then each kind of constraint as one plain sentence.
    // The raw constraints of a kind are behind a button in its group, as a fallback and for the status of each.
    // The toggle button here is the "Show/Hide rules" control.
    // It is not a separate button above a second collapsible section.
    const [settings, setSetting] = useSettings();
    const open = settings.constraintPanelOpen;
    const setOpen = (next: boolean) => setSetting("constraintPanelOpen", next);
    // Selected cells on the board highlight the constraints that cover all of them.
    // A single cell highlights all constraints that include it.
    // A dragged run highlights only the constraints that contain the run.
    const matched = useMemo(() => {
        if (!open || !selection || selection.size === 0) return new Set<string>();
        return new Set(
            evaluation.constraints
                .filter((c) => [...selection].every((cell) => c.cells.includes(cell)))
                .map((c) => c.id),
        );
    }, [open, evaluation, selection]);
    // Collapse per group, independent of the panel-level toggle above.
    // Groups are collapsed by default.
    // The state tracks the groups that were opened, not the groups that were closed.
    // So a group that is new in `groups` starts collapsed, and the full source list is not needed upfront.
    const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set());

    const toggleGroup = (source: string) =>
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(source)) next.delete(source);
            else next.add(source);
            return next;
        });

    // When open, the toggle button is also the status line.
    // There is one row, not a "Hide constraints" row above an "In progress — n/m cells" row.
    const label = open
        ? evaluation.complete
            ? "Solved: all constraints satisfied"
            : evaluation.status === "invalid"
              ? "Some constraints are broken"
              : `In progress: ${evaluation.filledCount}/${evaluation.cellCount} cells`
        : "Show rules";

    return (
        <section className={`constraint-panel ${open ? "cp-open" : ""}`}>
            <button
                type="button"
                className={`btn btn-flat pp-toggle cp-toggle ${open ? `cp-${evaluation.status}` : ""}`}
                aria-expanded={open}
                onClick={() => setOpen(!open)}
            >
                <BookOpen size={15} /> {label}
            </button>

            {open && (
                <>
                    {description && <p className="cp-description">{description}</p>}
                    <ul className="cp-groups">
                        {groups.map((g) => {
                            const hasMatch = g.items.some((item) => matched.has(item.id));
                            // A group with a highlighted constraint opens by itself, so the match is visible.
                            const rule = definitions[g.source]?.rule;
                            const isCollapsed = !expandedGroups.has(g.source) && !hasMatch;
                            return (
                                <li key={g.source} className="cp-group">
                                    <div className={`cp-group-head${hasMatch ? " cp-has-match" : ""}`}>
                                        <span className="cp-source">{g.source}</span>
                                        <span className="cp-counts">
                                            {g.violated > 0 && <em className="bad">{g.violated} broken</em>}
                                            {g.incomplete > 0 && <em className="pending">{g.incomplete} pending</em>}
                                            {g.violated === 0 && g.incomplete === 0 && (
                                                <em className="ok">all satisfied</em>
                                            )}
                                        </span>
                                    </div>
                                    {rule && <p className="cp-rule">{rule}</p>}
                                    <button
                                        type="button"
                                        className="cp-raw-toggle"
                                        aria-expanded={!isCollapsed}
                                        onClick={() => toggleGroup(g.source)}
                                    >
                                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                        {isCollapsed ? "Show" : "Hide"} constraints ({g.items.length})
                                    </button>
                                    {!isCollapsed && (
                                        <ul className="cp-items">
                                            {g.items.map((item) => (
                                                <li
                                                    key={item.id}
                                                    className={`cp-item cp-${item.status}${matched.has(item.id) ? " cp-match" : ""}`}
                                                    aria-current={matched.has(item.id) || undefined}
                                                >
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
