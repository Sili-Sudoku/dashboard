import { useMemo } from "react";
import { Check, CircleAlert, CircleDashed } from "lucide-react";

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

    return (
        <section className="constraint-panel">
            <header className={`cp-status cp-${evaluation.status}`}>
                {evaluation.complete
                    ? "Solved — every constraint satisfied"
                    : evaluation.status === "invalid"
                      ? "Some constraints are broken"
                      : `In progress — ${evaluation.filledCount}/${evaluation.cellCount} cells`}
            </header>

            <ul className="cp-groups">
                {groups.map((g) => (
                    <li key={g.source} className="cp-group">
                        <div className="cp-group-head">
                            <span className="cp-source">{g.source}</span>
                            <span className="cp-counts">
                                {g.violated > 0 && <em className="bad">{g.violated} broken</em>}
                                {g.incomplete > 0 && <em className="pending">{g.incomplete} pending</em>}
                                {g.violated === 0 && g.incomplete === 0 && <em className="ok">all satisfied</em>}
                            </span>
                        </div>
                        <ul className="cp-items">
                            {g.items.map((item) => (
                                <li key={item.id} className={`cp-item cp-${item.status}`}>
                                    <StatusIcon status={item.status} />
                                    <span>{item.label ?? item.id}</span>
                                    {item.error && <span className="cp-error">{item.error}</span>}
                                </li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ul>
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
