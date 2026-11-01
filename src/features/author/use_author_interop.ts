import { useState } from "react";

import { toast } from "@/app/toast.ts";
import type { PuzzleDefinition } from "@/runtime/puzzle.ts";
import {
    encodeFPuzzlesShareLink,
    encodeSudokuPadShareLink,
    exportFPuzzles,
    importFPuzzles,
} from "@/interop/fpuzzles.ts";
import { encodeSudokuMakerShareLink, exportSudokuMaker, importSudokuMaker } from "@/interop/sudokumaker.ts";
import type { ImportDialogProps } from "@/features/author/import_dialog.tsx";

export type ImportFormat = "fpuzzles" | "sudokumaker";
export type ExportTarget = "fpuzzles" | "sudokupad" | "sudokumaker";

interface Converted<T> {
    value: T;
    warnings: readonly string[];
}

/** Each import format: the dialog's copy, plus the parser and the label used in the success toast. */
const IMPORTS: Record<
    ImportFormat,
    {
        title: string;
        placeholder: string;
        noun: string;
        parse: (input: unknown) => { puzzle: PuzzleDefinition; warnings: readonly string[] } | Error;
    }
> = {
    fpuzzles: {
        title: "Import from f-puzzles",
        placeholder: "Paste f-puzzles JSON or an f-puzzles.com share link…",
        noun: "f-puzzles JSON",
        parse: importFPuzzles,
    },
    sudokumaker: {
        title: "Import from SudokuMaker",
        placeholder: "Paste SudokuMaker JSON or a sudokumaker.app share link…",
        noun: "SudokuMaker JSON",
        parse: importSudokuMaker,
    },
};

/** Each export target: how to turn a puzzle into a share link, and its display name. */
const EXPORTS: Record<ExportTarget, { name: string; link: (puzzle: PuzzleDefinition) => Converted<string> | Error }> = {
    fpuzzles: {
        name: "f-puzzles",
        link: (puzzle) => {
            const exported = exportFPuzzles(puzzle);
            return exported instanceof Error
                ? exported
                : { value: encodeFPuzzlesShareLink(exported.data), warnings: exported.warnings };
        },
    },
    sudokupad: {
        name: "SudokuPad",
        link: (puzzle) => {
            const exported = exportFPuzzles(puzzle);
            return exported instanceof Error
                ? exported
                : { value: encodeSudokuPadShareLink(exported.data), warnings: exported.warnings };
        },
    },
    sudokumaker: {
        name: "SudokuMaker",
        link: (puzzle) => {
            const exported = exportSudokuMaker(puzzle);
            return exported instanceof Error
                ? exported
                : { value: encodeSudokuMakerShareLink(exported.data), warnings: exported.warnings };
        },
    },
};

/** Import/export outcome toast. One key, so a second action replaces the first
 *  instead of stacking; warning lists are long, so they linger. */
const notifyInterop = (warnings: readonly string[], withWarnings: string, plain: string): void =>
    warnings.length > 0
        ? toast(`${withWarnings}${warnings.length} warning(s):\n${warnings.join("\n")}`, {
              key: "interop",
              duration: 12000,
          })
        : toast(plain, { kind: "success", key: "interop" });

/**
 * The Author page's f-puzzles / SudokuMaker / SudokuPad import and export:
 * the import dialog's open/draft state plus the handlers behind its buttons.
 * `dialog` is the props for <ImportDialog>, or undefined while it's closed.
 */
export function useAuthorInterop(parsed: PuzzleDefinition | undefined, applyText: (json: string) => void) {
    const [format, setFormat] = useState<ImportFormat | undefined>();
    const [draft, setDraft] = useState("");

    const closeImport = () => {
        setFormat(undefined);
        setDraft("");
    };

    const openImport = (next: ImportFormat) => {
        setDraft("");
        setFormat(next);
    };

    const submitImport = () => {
        const pasted = draft.trim();
        if (format && pasted) {
            const imported = IMPORTS[format].parse(pasted);
            if (imported instanceof Error) {
                toast(`Import failed: ${imported.message}`, { kind: "error", key: "interop" });
            } else {
                applyText(JSON.stringify(imported.puzzle, null, 2));
                notifyInterop(imported.warnings, "Imported with ", `Imported ${IMPORTS[format].noun}.`);
            }
        }
        closeImport();
    };

    const exportTo = (target: ExportTarget) => {
        if (!parsed) return;
        const { name, link } = EXPORTS[target];
        const result = link(parsed);
        if (result instanceof Error) {
            toast(`Export failed: ${result.message}`, { kind: "error", key: "interop" });
            return;
        }
        window.open(result.value, "_blank", "noopener,noreferrer");
        notifyInterop(result.warnings, "Opened in a new tab, with ", `Opened ${name} share link in a new tab.`);
    };

    const dialog: ImportDialogProps | undefined = format && {
        title: IMPORTS[format].title,
        placeholder: IMPORTS[format].placeholder,
        value: draft,
        onChange: setDraft,
        onCancel: closeImport,
        onSubmit: submitImport,
    };

    return { openImport, exportTo, dialog };
}
