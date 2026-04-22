# jiraworklog
Command line tool to add worklogs quickly

# Features

* Import time entries from toggl directly into Jira
* Print summary of toggl time entries before adding them to jira
* Add manual time entries with inquirer
* Desktop app (Electron) with the same Toggl import and manual booking flows


# Desktop app (Electron)

Run the UI locally (loads `.env` / `.env.local` like the CLI):

```bash
npm run dev:app
```

Production build output is written to `out/`. To produce a Windows installer with [electron-builder](https://www.electron.build/):

```bash
npm run dist
```

Artifacts appear under `release/`.

Environment variables (same as the CLI):

* `JIRA_TOKEN` — optional; if set, the app can skip password login.
* `JIRA_PASS` — optional default password for non-token auth.
* `TOGGL_API_TOKEN` — required for Toggl import.

The command-line tool is unchanged: use `npm run dev` or `npm start` for the Inquirer-based CLI.

The Windows / installer icon comes from [`build/icon.png`](build/icon.png) (also copied to [`src/renderer/public/app-icon.png`](src/renderer/public/app-icon.png) for the in-app header).


# Jira Setup

You can setup either `JIRA_TOKEN` or insert username and password on each start. This is the preferred method.
As an alternative you could save your password in `JIRA_PASS` and omit the entry of the password each time.


# Setup for auto import with toggl

* Get your Toggl API token from https://track.toggl.com/profile
* Set environment variable `TOGGL_API_TOKEN` to your API token
* Use toggl workspace with name `Zwick` (or change the workspace name in `config.json`)
* Setup toggl projects according to `config.json` e.g. "Daily", "Sonstiges" etc. The names must match exactly.

The main settings in `config.json` are: `issues` (maps Toggl project names to Jira issues), `jiraProjectKeys` (allowed issue key prefixes for parsing free-text entries), `maxLastIssues` / `maxLastDays` (CLI history limits), `jiraUrl`, `togglUrl`, `togglWorkspace`, `addTxpiv450SummaryEntry` (enables the additional summary booking), and `togglImportSummaryIssueKey` (target issue for that summary worklog, e.g. `TXPIV-450`).


# How to format your toggl entries

* All time entries with fixed toggl projects (from `config.json`) use the text description for the work log comment.
* All other time entries are parsed like this: <custom name> <TXR-xxxxx> <work log comment>
  * The custom name is purely used to remember what each issue is about. It is not used in the work log comment.
  * The TXR-xxxxx is the Jira issue key. 
  * The work log comment is the rest of the text. It is optional and used as the work log comment.


# Ideas

- [x] Print toggl daily summary before asking to post
