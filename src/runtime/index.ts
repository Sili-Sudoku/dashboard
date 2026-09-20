/**
 * The generic constraint puzzle runtime.
 *
 * Nothing here knows what a thermometer, cage, or arrow is. It provides
 * capabilities — geometry, a constraint language, evaluation, interactive state,
 * serialization — that puzzle definitions compose into semantics.
 */

export * from "@/runtime/geometry.ts";
export * from "@/runtime/expression.ts";
export {
    OPERATORS,
    evalExpr,
    evalPredicate,
    operatorNames,
    staticCheckExpr,
    type OperatorFn,
} from "@/runtime/operators.ts";
export * from "@/runtime/puzzle.ts";
export { compilePuzzle } from "@/runtime/compile.ts";
export * from "@/runtime/evaluate.ts";
export {
    PuzzleSession,
    progressStorageKey,
    type CellState,
    type ProgressSnapshot,
    type SelectMode,
    type SessionOptions,
} from "@/runtime/session.ts";
export { parsePuzzle, encodePuzzle, decodePuzzle } from "@/runtime/serialization.ts";
