import { useInRouterContext, Link } from "react-router-dom";
import { PartyPopper } from "lucide-react";

import { useFocusTrap } from "@/app/use_focus_trap.ts";

import "./style.css";

interface Props {
    /** The solve time, already formatted. */
    time: string;
    /** The best time, already formatted, if there is one. */
    best?: string;
    /** This solve is the best time (the first solve counts). */
    newBest: boolean;
    onClose: () => void;
}

const CONFETTI_COUNT = 36;
const CONFETTI_COLORS = ["--accent", "--brand", "--satisfied", "--incomplete", "--palindrome"];

/** Confetti pieces with fixed, spread-out values (no randomness, so a render is always the same). */
const confetti = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    left: (i * 37 + 11) % 100,
    delay: ((i * 53) % 100) / 100,
    duration: 2.6 + ((i * 17) % 10) / 10,
    drift: ((i * 29) % 61) - 30,
    spin: 360 + ((i * 41) % 5) * 90,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

/** The "puzzle solved" moment: a dialog centred on the board with the time, and a short burst of confetti.
 *  The confetti is CSS only and is off for `prefers-reduced-motion`. */
export default function SolvedCelebration({ time, best, newBest, onClose }: Props) {
    const { ref, onKeyDown } = useFocusTrap<HTMLDivElement>();
    const inRouter = useInRouterContext();
    return (
        <>
            <div className="solved-backdrop" onClick={onClose} />
            <div className="solved-confetti" aria-hidden="true">
                {confetti.map((c, i) => (
                    <span
                        key={i}
                        style={
                            {
                                left: `${c.left}%`,
                                background: `var(${c.color})`,
                                animationDelay: `${c.delay}s`,
                                animationDuration: `${c.duration}s`,
                                "--drift": `${c.drift}vw`,
                                "--spin": `${c.spin}deg`,
                            } as React.CSSProperties
                        }
                    />
                ))}
            </div>
            {/* The dialog is centred on the board, not on the window: the sidebar makes the board off-centre.
                Render this inside the board column (the anchor is its box). */}
            <div className="solved-anchor">
                <div
                    className="solved-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="solved-title"
                    ref={ref}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") onClose();
                        onKeyDown(e);
                    }}
                >
                    <PartyPopper size={44} className="solved-icon" aria-hidden="true" />
                    <h2 id="solved-title">Solved!</h2>
                    <p className="solved-time">{time}</p>
                    <p className="solved-best">
                        {newBest ? "A new best time!" : best !== undefined ? `Best time ${best}` : null}
                    </p>
                    <div className="solved-actions">
                        <button className="btn" onClick={onClose}>
                            Keep looking
                        </button>
                        {inRouter && (
                            <Link to="/puzzles" className="btn btn-primary">
                                More puzzles
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
