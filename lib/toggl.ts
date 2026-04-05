import _ from "lodash";
import axios from "axios";
import type { Moment } from "moment";
import config from "../config.json" with { type: "json" };
import type {
    TogglApiTimeEntry,
    TogglProject,
    TogglWorkspace,
    TogglTimeEntry,
    WorkLogEntry,
    ProjectIdToNameDict,
} from "./types.js";

const password = "api_token";

const createDescription = (collection: object[], key: string): string =>
    _.uniq(_.compact(_.map(collection, key))).join(", ");

async function getProjectsIdToNameDict(): Promise<ProjectIdToNameDict> {
    const { data: workspacesData } = await axios.get<TogglWorkspace[]>(
        `${config.togglUrl}/workspaces`,
        {
            auth: { username: process.env.TOGGL_API_TOKEN!, password },
        },
    );

    const workspaceId = _.find(workspacesData, ["name", config.togglWorkspace])?.id;
    if (!workspaceId) {
        throw new Error(
            `Workspace id for workspace ${config.togglWorkspace} not found. Please check your config!`,
        );
    }

    const { data: body } = await axios.get<TogglProject[]>(
        `${config.togglUrl}/workspaces/${workspaceId}/projects`,
        {
            auth: { username: process.env.TOGGL_API_TOKEN!, password },
        },
    );
    return _.reduce(
        body,
        (acc: ProjectIdToNameDict, project: TogglProject) => {
            acc[project.id] = project.name;
            return acc;
        },
        {},
    );
}

async function getTimeEntries(dateToBook: Moment): Promise<TogglTimeEntry[]> {
    // copy dateToBook to prevent mutation of reference by adding one day below.
    const dataToBookCopy = dateToBook.clone();
    const dict = await getProjectsIdToNameDict();
    const toTogglDate = (date: Moment) => date.format("YYYY-MM-DD");
    const toggleDateStart = toTogglDate(dataToBookCopy);
    const toggleDateEnd = toTogglDate(dataToBookCopy.add(1, "day"));
    const { data: body } = await axios.get<TogglApiTimeEntry[]>(
        `${config.togglUrl}/me/time_entries`,
        {
            auth: { username: process.env.TOGGL_API_TOKEN!, password },
            params: {
                start_date: toggleDateStart,
                end_date: toggleDateEnd,
            },
        },
    );
    return _.map(body, (entry: TogglApiTimeEntry) => ({
        description: entry.description,
        project: entry.project_id !== null ? dict[entry.project_id] : undefined,
        duration: entry.duration,
    }));
}

function convertToWorkLogEntries(timeEntries: TogglTimeEntry[]): WorkLogEntry[] {
    const knownProjects = _.map(config.issues, (issue) => issue.name);
    const entriesWithIssueKey = _.map(timeEntries, (entry) => {
        let issueKey: string | undefined;
        if (knownProjects.includes(entry.project ?? "")) {
            issueKey = _.find(config.issues, ["name", entry.project])?.value;
        } else {
            const regex = new RegExp(
                `(.*)((?:${config.jiraProjectKeys.join("|")})-\\d+)\\s*(.*)`,
                "i",
            );
            const matches = entry.description.match(regex);
            if (matches) {
                issueKey = matches[2].toUpperCase();
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
export { getProjectsIdToNameDict, getTimeEntries, convertToWorkLogEntries };
