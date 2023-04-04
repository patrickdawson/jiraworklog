const _ = require("lodash");
const got = require("got");

const config = require("../config");
const password = "api_token";

const createDescription = _.flow([_.map, _.uniq, _.compact, _.partialRight(_.join, ", ")]);

async function getProjectsIdToNameDict() {
    const workspacesResponse = await got.get(`${config.togglUrl}/workspaces`, {
        responseType: "json",
        username: process.env.TOGGL_API_TOKEN,
        password,
    });

    const workspaceId = _.find(workspacesResponse.body, ["name", config.togglWorkspace])?.id;
    if (!workspaceId) {
        throw new Error(
            `Workspace id for workspace ${config.togglWorkspace} not found. Please check your config!`,
        );
    }

    /*
    Example project doc
    {
       id: 152646243,
       workspace_id: 1124947,
       client_id: 17596760,
       name: 'Support Unternehmensbereiche',
       is_private: true,
       active: true,
       at: '2020-06-09T03:50:06+00:00',
       created_at: '2019-07-08T06:31:55+00:00',
       server_deleted_at: null,
       color: '#2da608',
       billable: null,
       template: null,
       auto_estimates: null,
       estimated_hours: null,
       rate: null,
       rate_last_updated: null,
       currency: null,
       recurring: false,
       recurring_parameters: null,
       current_period: null,
       fixed_fee: null,
       actual_hours: 19,
       wid: 1124947,
       cid: 17596760
     }
     */
    const { body } = await got.get(`${config.togglUrl}/workspaces/${workspaceId}/projects`, {
        responseType: "json",
        username: process.env.TOGGL_API_TOKEN,
        password,
    });
    return _.reduce(
        body,
        (acc, project) => {
            acc[project.id] = project.name;
            return acc;
        },
        {},
    );
}

async function getTimeEntries(dateToBook) {
    /*
  Example time entry doc
  {
    id: 2729834974,
    workspace_id: 1124947,
    project_id: 11542245,
    task_id: null,
    billable: false,
    start: '2022-11-15T06:53:18+00:00',
    stop: '2022-11-15T07:05:25Z',
    duration: 727,
    description: 'Emails/Confluence',
    tags: null,
    tag_ids: null,
    duronly: false,
    at: '2022-11-15T07:05:27+00:00',
    server_deleted_at: null,
    user_id: 466345,
    uid: 466345,
    wid: 1124947,
    pid: 11542245
  }
 */
    // copy dateToBook to prevent mutation of reference by adding one day below.
    const dataToBookCopy = dateToBook.clone();
    const dict = await getProjectsIdToNameDict();
    const toTogglDate = (date) => date.format("YYYY-MM-DD");
    const toggleDateStart = toTogglDate(dataToBookCopy);
    const toggleDateEnd = toTogglDate(dataToBookCopy.add(1, "day"));
    const { body } = await got.get(`${config.togglUrl}/me/time_entries`, {
        responseType: "json",
        username: process.env.TOGGL_API_TOKEN,
        password,
        searchParams: {
            start_date: toggleDateStart,
            end_date: toggleDateEnd,
        },
    });
    return _.map(body, (entry) => ({
        description: entry.description,
        project: dict[entry.project_id],
        duration: entry.duration,
    }));
}

function convertToWorkLogEntries(timeEntries) {
    const knownProjects = _.map(config.issues, (issue) => issue.name);
    const entriesWithIssueKey = _.map(timeEntries, (entry) => {
        let issueKey;
        if (knownProjects.includes(entry.project)) {
            issueKey = _.find(config.issues, ["name", entry.project])?.value;
        } else {
            const regex = new RegExp(`(.*)((?:${config.jiraProjectKeys.join("|")})-\\d+)\\s*(.*)`);
            const matches = entry.description.match(regex);
            if (matches) {
                issueKey = matches[2];
                entry.description = matches[3];
            }
        }
        return {
            ...entry,
            issueKey,
        };
    });
    const grouped = _.groupBy(entriesWithIssueKey, "issueKey");
    const result = _.mapValues(grouped, (entryGroup, key) => {
        const duration = _.sumBy(entryGroup, "duration");

        return {
            issueKey: key,
            durationMin: Math.floor(duration / 60),
            description: createDescription(entryGroup, "description"),
        };
    });
    return _.values(result);
}

// Idee: Text vor Issue No ist Titel und wird ignoriert, Text nach IssueNo wird Description
module.exports = {
    getProjectsIdToNameDict,
    getTimeEntries,
    convertToWorkLogEntries,
};
