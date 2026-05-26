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

* `JIRA_TOKEN` — optional Atlassian API token ([create one](https://id.atlassian.com/manage-profile/security/api-tokens)).
* `JIRA_USER` — Atlassian account email; required with `JIRA_TOKEN` for non-interactive login.
* `TOGGL_API_TOKEN` — required for Toggl import.

The command-line tool is unchanged: use `npm run dev` or `npm start` for the Inquirer-based CLI.

The Windows / installer icon comes from [`build/icon.png`](build/icon.png) (also copied to [`src/renderer/public/app-icon.png`](src/renderer/public/app-icon.png) for the in-app header).


# Jira Setup

Jira Cloud uses **Basic authentication** with your **Atlassian account email** and an **API token** (not your account password).

Set `JIRA_USER` and `JIRA_TOKEN` in `.env` or `.env.local`, or enter email + API token when prompted.


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
