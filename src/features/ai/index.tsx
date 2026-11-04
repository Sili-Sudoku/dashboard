import "./style.css";

/** Same text as the "AI disclaimer" section of the README. Keep the two in step. */
export default function AiDisclaimer() {
    return (
        <div className="ai-page">
            <h1>AI disclaimer</h1>
            <p>
                Neither this project nor I am against AI development or AI tooling. What matters at the end of the day
                is the quality of the work, and transparency about it.
            </p>
            <p>
                AI helped write the code. I'm a professional developer and did not need AI to build this site, but it
                saved a significant amount of time. The architecture and the design decisions are mine. Puzzles are made
                by people, not by AI. This project will never generate puzzles or art.
            </p>
            <p>
                I expect everything here to be human-designed. Tools that help a person get their own idea into the
                format are fine. For example, an AI can turn a rule you thought of into the JSON config. Passing off
                AI-generated work as your own is not welcome.
            </p>
        </div>
    );
}
