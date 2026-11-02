import { readOverride, withOverride } from "@/authoring/style_override.ts";

/** A neutral green to start from: the colour input needs a real value to show once "Set colour" is pressed. */
const STARTING_COLOR = "#3aa76d";

interface Props {
    spec: { use: string; [key: string]: unknown };
    onChange: (next: { use: string; [key: string]: unknown }) => void;
}

/** Colour, dashed and opacity for one placed constraint (#165): the per-instance override from #132. */
export default function StyleEditor({ spec, onChange }: Props) {
    const { color, dashed, opacity } = readOverride(spec);
    const set = (patch: Parameters<typeof withOverride>[1]) => onChange(withOverride(spec, patch));
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
