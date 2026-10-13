// Fails once an advisory in auditConfig.ignoreGhsas has an installable fix,
// so the ignore entry gets removed instead of forgotten.
import { execSync } from "node:child_process";

const RELEASE_AGE_MS = 4320 * 60 * 1000; // minimumReleaseAge in pnpm-workspace.yaml

const ignored = [{ ghsa: "GHSA-hp3w-g68c-fv3c", pkg: "sprintf-js", patched: [1, 1, 4] }];

const atLeast = (v, min) => {
    for (let i = 0; i < 3; i++) if (v[i] !== min[i]) return v[i] > min[i];
    return true;
};

let failed = false;
for (const { ghsa, pkg, patched } of ignored) {
    const time = JSON.parse(execSync(`npm view ${pkg} time --json`, { encoding: "utf8" }));
    const fix = Object.entries(time).find(([v, t]) => {
        const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
        return (
            m &&
            atLeast(m.slice(1).map(Number), patched) &&
            Date.now() - Date.parse(t) > RELEASE_AGE_MS
        );
    });
    if (fix) {
        console.log(
            `::error::${pkg} ${fix[0]} is installable. Remove ${ghsa} from auditConfig.ignoreGhsas in pnpm-workspace.yaml and refresh the lockfile.`,
        );
        failed = true;
    } else {
        console.log(`${pkg}: no installable fix for ${ghsa} yet; ignore entry stays.`);
    }
}
process.exit(failed ? 1 : 0);
