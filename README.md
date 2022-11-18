# jiraworklog
Command line tool to add worklogs quickly

# Features
* Import time entries from toggl directly into Jira
* Print summary of toggl time entries before adding them to jira
* Add manual time entries with inquirer

# Setup for auto import with toggl
* Get your Toggl API token from https://track.toggl.com/profile
* Set environment variable `TOGGL_API_TOKEN` to your API token
* Use toggl workspace with name `Zwick` (or change the workspace name in `config.json`)
* Setup toggl projects according to `config.json` e.g. "Daily", "Sonstiges" etc. The names must match exactly.

# How to format your toggl entries
* All time entries with fixed toggl projects (from `config.json`) use the text description for the work log comment.
* All other time entries are parsed like this: <custom name> <TXR-xxxxx> <work log comment>
  * The custom name is purely used to remember what each issue is about. It is not used in the work log comment.
  * The TXR-xxxxx is the Jira issue key. 
  * The work log comment is the rest of the text. It is optional and used as the work log comment.


# Ideas
- [x] Print toggl daily summary before asking to post
