# CLAUDE.md

CLI tool for logging work time to Jira — two modes: Toggl import and manual entry.

Entry point: `app.js` → `lib/run.js:run()`

## Non-obvious Conventions

- UI language is German.
- Toggl description parsing: entries with known project names (from `config.json`) use their mapped issue key. Other entries are parsed with regex `<title> <PROJECT_KEY-number> <optional comment>`.
- The `conf` package persists user preferences (last user, recently used issues) across runs.

## Before Finishing Work

Always run `npm run prettier:write` before finishing any task.
