import "@/features/ai/style.css";

/** Same text as the "Puzzle ownership" section of the README. Keep the two in step. */
export default function PuzzleOwnership() {
    return (
        <div className="ai-page">
            <h1>Puzzle ownership</h1>
            <p>Last updated 5 November 2026.</p>
            <h2>You own your puzzles</h2>
            <p>
                Everything you make is yours, wherever it came from: made here, imported from another tool, or shared by
                a link. You keep all rights to it and can do what you like with it.
            </p>
            <h2>What the site may do</h2>
            <p>
                When you publish a puzzle, you let the site show it and pass it on to other people on the site. That is
                all. The permission is not exclusive, and it ends when you delete the puzzle.
            </p>
            <h2>What the site will not do</h2>
            <p>
                Use your puzzles for anything else. I will not sell them, license them to anyone, or use them to train
                AI.
            </p>
            <h2>Taking a puzzle down</h2>
            <p>
                You can remove your puzzle at any time. I only remove one myself for safety reasons, or because it
                breaks the rule below.
            </p>
            <h2>Publish only your own</h2>
            <p>
                Publish only puzzles you made, or have the maker's permission for. Passing off someone else's puzzle as
                yours is a violation. I will remove it and may stop you from publishing again. The owner keeps all their
                rights and can act on them directly.
            </p>
        </div>
    );
}
