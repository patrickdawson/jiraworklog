---
name: fixing-audit-findings
description: "Resolve a pnpm audit vulnerability by climbing from stale lockfile to parent update before reaching for an override. Use when `pnpm audit` reports a finding, the audit CI stage is red, or you are about to add an override to pnpm-workspace.yaml."
---

# Fixing audit findings

An override is a permanent **floor** welded into `pnpm-workspace.yaml`. It outlives the vulnerability that justified it, and once the tree moves past its selector it goes **inert** — dead config that still reads as an active security constraint. So overrides are the last rung.

Climb the ladder in order and stop at the first rung that clears the audit:

1. **Stale lockfile** — the patch is already allowed; the lockfile just hasn't seen it.
2. **Parent update** — move the package that pulls the vulnerable one.
3. **Override** — force the version.

## 1. Read the finding

Run the audit exactly as CI does (`.github/workflows/audit.yml`), then trace the chain:

```bash
pnpm audit --audit-level moderate
pnpm why <vulnerable-package>
```

Record the **patched range** and the **parent** that pulls the package. Done when you can name every top-level dependency in `package.json` whose chain reaches the finding.

## 2. Rung 1 — test for a stale lockfile

Ask whether the parent's declared range already admits the patched version:

```bash
npm view <parent>@<resolved-version> dependencies.<vulnerable-package>
```

If the patched version satisfies that range, nothing holds it back but an old resolution — the lockfile is **stale**, and the fix is free.

Forcing the refresh is the part that surprises: `pnpm update <vulnerable-package> --depth Infinity` leaves a locked transitive exactly where it is. Moving the **parent** is what triggers a fresh resolution, so a stale lockfile is cured through rung 2.

## 3. Rung 2 — update the parent

Update the narrowest set of top-level dependencies that owns the chain:

```bash
pnpm update <parent> [<parent>...] --latest
```

A new parent version writes a new lockfile entry, and its dependencies resolve fresh to the highest in-range version — which is the patched one.

Then confirm what you actually got. A parent update lands the patch by resolution, not by mandate: the new parent may still declare a range that admits the vulnerable version, so read the lockfile rather than trusting the bump.

```bash
grep -n "<vulnerable-package>" pnpm-lock.yaml
```

`pnpm why` reads `node_modules`, which holds leftovers from earlier installs — the lockfile is the truth.

## 4. Rung 3 — override

Reach here only when no reachable parent version admits a patched transitive. Add to `overrides:` in `pnpm-workspace.yaml`, matching the surrounding selector style:

```yaml
<package>@<vulnerable-range>: '<patched-version>'
```

Prefer that ranged selector over a bare `<package>: '<version>'`: it stops applying on its own once the tree moves past it, which keeps the entry auditable later. Say in the commit message which advisory it answers, so a future audit can tell a live override from an inert one.

## 5. Check the release-age gate

`pnpm-workspace.yaml` sets `minimumReleaseAge`, and a fix published inside that window will not install regardless of which rung you used:

```bash
npm view <package> time --json
```

If the patch is younger than the gate, wait it out and say so — the gate is the supply-chain protection, worth more than a green stage today.

## 6. Verify

Every one of these, on top of a clean audit:

```bash
pnpm audit --audit-level moderate
pnpm run typecheck
pnpm test
pnpm run build:electron
pnpm peers check
```

`build:electron` earns its place: a `vite` or `postcss` bump breaks the electron build while the test suite stays green. For `peers check`, compare against the state before your change — pre-existing unmet peers belong in an issue, not in this fix.

## 7. Sweep for inert overrides

A parent update can push a package past an existing override's selector, leaving it inert. Remove any override that no longer matches something in the tree.

The test is exact: an inert override contributes nothing to resolution, so deleting it and reinstalling leaves `pnpm-lock.yaml` byte-identical. An override whose removal changes the lockfile is still load-bearing — restore it.

**Done when** the audit exits clean, all five checks above pass, and every override left in `pnpm-workspace.yaml` still matches a resolved version.
