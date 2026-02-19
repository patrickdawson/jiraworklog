# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CLI tool for logging work time to Jira. Two modes:
- **Toggl import**: Fetches time entries from Toggl Track API, summarizes them, and posts as Jira worklogs
- **Manual entry**: Interactive prompts (inquirer) to select issue, enter time, and post to Jira

Entry point: `app.js` → `lib/run.js:run()`

## Commands

- **Run tests**: `npm test` (Jest)
- **Run single test**: `npx jest test/toggl.spec.js` or `npx jest -t "test name pattern"`
- **Watch mode**: `npm run test:dev`
- **Format check**: `npm run prettier`
- **Format fix**: `npm run prettier:write`

## Architecture

- `lib/run.js` — Main flow: auth → date selection → toggl import or manual booking → POST to Jira REST API (`/rest/api/latest/issue/{key}/worklog`)
- `lib/toggl.js` — Toggl API integration: fetches workspaces, projects, time entries; `convertToWorkLogEntries()` parses toggl entries into worklog format (groups by issue key, sums durations, merges descriptions)
- `lib/auth.js` — Handles auth via `JIRA_TOKEN` (Bearer) or username/password with credential validation
- `config.json` — Maps predefined project names to Jira issue keys; defines `jiraProjectKeys` used for regex parsing of toggl descriptions

## Key Conventions

- Toggl description parsing: entries with known project names (from `config.json`) use their mapped issue key. Other entries are parsed with regex `<title> <PROJECT_KEY-number> <optional comment>`.
- Tests use `nock` for HTTP mocking, `jest.mock()` for module mocking (inquirer, conf, auth, toggl, config). Config values are overridden in `beforeAll`.
- The `conf` package persists user preferences (last user, recently used issues) across runs.
- UI language is German.
