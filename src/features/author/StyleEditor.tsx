import { useRef, useState } from "react";

import { OverflowMenu } from "@/app/overflow_menu.tsx";
import { readOverride, withOverride } from "@/authoring/style_override.ts";
import { PATTERNS, type PatternName } from "@/runtime/puzzle.ts";

/** A neutral green as the start value. The colour input needs a real value to show after "Set colour" is pressed. */
const STARTING_COLOR = "#3aa76d";

/** The puzzle JSON stores uploaded pictures. Thus they must be small. */
const MAX_IMAGE_BYTES = 150_000;

const PATTERN_LABELS: Record<PatternName, string> = {
    stripes: "Stripes",
    dots: "Dots",
    checks: "Checks",
    crosshatch: "Crosshatch",
};

interface Props {
    spec: { use: string; [key: string]: unknown };
    onChange: (next: { use: string; [key: string]: unknown }) => void;
}

/** Colour, dashed and opacity for one placed constraint (#165). This is the override for each instance from #132. */
export default function StyleEditor({ spec, onChange }: Props) {
    const { color, dashed, opacity, pattern, image } = readOverride(spec);
    const set = (patch: Parameters<typeof withOverride>[1]) => onChange(withOverride(spec, patch));
    const fileRef = useRef<HTMLInputElement>(null);
    const [problem, setProblem] = useState<string | null>(null);

    const upload = (file: File | undefined): void => {
        if (!file) return;
        if (!/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.type))
            return setProblem("Use a PNG, JPEG, GIF, WebP or SVG.");
        if (file.size > MAX_IMAGE_BYTES) return setProblem("The picture is more than 150 KB. Use a smaller picture.");
        const reader = new FileReader();
        reader.onload = () => {
            setProblem(null);
            set({ image: reader.result as string });
        };
        reader.readAsDataURL(file);
    };
    const clearFill = { label: "Plain", onSelect: (): void => set({ pattern: undefined, image: undefined }) };
    return (
        <div className="style-editor">
            <div className="style-editor-row">
                <span>Colour</span>
                {color === undefined ? (
                    <button type="button" className="btn btn-sm" onClick={() => set({ color: STARTING_COLOR })}>
                        Set colour
                    </button>
                ) : (
                    <>
                        {/^#[0-9a-f]{6}$/i.test(color) ? (
                            <input
                                type="color"
                                aria-label="Colour"
                                value={color}
                                onChange={(e) => set({ color: e.target.value })}
                            />
                        ) : (
                            <code>{color}</code> // a name or var() set in the JSON: shown, not editable here
                        )}
                        <button type="button" className="btn btn-sm" onClick={() => set({ color: undefined })}>
                            Use default
                        </button>
                    </>
                )}
            </div>
            <div className="style-editor-row">
                <span>Fill</span>
                <OverflowMenu
                    label="Fill"
                    text={image ? "Picture" : pattern ? PATTERN_LABELS[pattern] : "Plain"}
                    align="start"
                    flat
                    items={[
                        clearFill,
                        ...PATTERNS.map((p) => ({
                            label: PATTERN_LABELS[p],
                            onSelect: (): void => set({ pattern: p }),
                        })),
                        { label: "Upload picture…", onSelect: (): void => fileRef.current?.click() },
                    ]}
                />
                <input
                    ref={fileRef}
                    type="file"
                    hidden
                    aria-label="Upload picture"
                    accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                    onChange={(e) => {
                        upload(e.target.files?.[0]);
                        e.target.value = "";
                    }}
                />
            </div>
            {problem && <div className="style-editor-row style-editor-problem">{problem}</div>}
            <label className="style-editor-row">
                <input
                    type="checkbox"
                    checked={dashed === true}
                    onChange={(e) => set({ dashed: e.target.checked ? true : undefined })}
                />
                Dashed
            </label>
            <label className="style-editor-row">
                <span>Opacity</span>
                <input
                    type="range"
                    aria-label="Opacity"
                    min={10}
                    max={100}
                    step={5}
                    value={Math.round((opacity ?? 1) * 100)}
                    onChange={(e) => {
                        const value = Number(e.target.value) / 100;
                        set({ opacity: value >= 1 ? undefined : value });
                    }}
                />
                <span>{opacity === undefined ? "default" : `${Math.round(opacity * 100)}%`}</span>
            </label>
        </div>
    );
}
