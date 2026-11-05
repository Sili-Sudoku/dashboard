/**
 * Warns when the Node version that this project requires is close to its end of life.
 * Run by `npm run deps`. Node patches are not backwards compatible, so like Go, we follow only supported versions.
 * The dates come from the official Node release schedule. If the network fails, the check is skipped.
 */
import { readFileSync } from "node:fs";

const SCHEDULE_URL = "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json";
/** Fail this many days before the end of life, so there is time to update. */
export const WARN_DAYS = 180;

export type Schedule = Record<string, { end: string }>;

/** The major version that `engines.node` requires, for example 24 for ">=24". */
export const requiredMajor = (engines: string): number => {
    const major = /(\d+)/.exec(engines)?.[1];
    if (!major) throw new Error(`Cannot read a Node version from engines.node: ${engines}`);
    return Number(major);
};

/** Days from `today` to the end of life of this Node major. Negative when it has passed. */
export const daysUntilEnd = (schedule: Schedule, major: number, today: Date): number | undefined => {
    const end = schedule[`v${major}`]?.end;
    if (!end) return undefined;
    return Math.floor((Date.parse(end) - today.getTime()) / 86_400_000);
};

export const describe = (major: number, days: number | undefined): { ok: boolean; message: string } => {
    if (days === undefined)
        return { ok: true, message: `Node ${major} is not in the release schedule. Check it by hand.` };
    if (days < 0) return { ok: false, message: `Node ${major} is past its end of life. Update engines.node and CI.` };
    if (days <= WARN_DAYS)
        return {
            ok: false,
            message: `Node ${major} reaches end of life in ${days} days. Plan an update of engines.node and CI.`,
        };
    return { ok: true, message: `Node ${major} is supported for ${days} more days.` };
};

const main = async (): Promise<void> => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { engines: { node: string } };
    const major = requiredMajor(pkg.engines.node);
    let schedule: Schedule;
    try {
        schedule = (await (await fetch(SCHEDULE_URL, { signal: AbortSignal.timeout(10_000) })).json()) as Schedule;
    } catch {
        console.warn("Could not fetch the Node release schedule. Skipping the Node support check.");
        return;
    }
    const { ok, message } = describe(major, daysUntilEnd(schedule, major, new Date()));
    console.log(message);
    if (!ok) process.exitCode = 1;
};

if (import.meta.url === `file://${process.argv[1]}`) await main();
