import _ from "lodash";
import got from "got";
import moment from "moment";

import config from "../config.json";
import type { TimeEntry, TogglProject, TogglRawTimeEntry, TogglWorkspace, WorkLogEntry } from "./types";

const password = "api_token";

const createDescription = _.flow([_.map, _.uniq, _.compact, _.partialRight(_.join, ", ")]);

export async function getProjectsIdToNameDict(): Promise<Record<number, string>> {
    const workspacesResponse = await got.get<TogglWorkspace[]>(
        `${config.togglUrl}/workspaces`,
        {
            responseType: "json",
            username: process.env.TOGGL_API_TOKEN,
            password,
        },
    );

    const workspaceId = _.find(workspacesResponse.body, ["name", config.togglWorkspace])?.id;
    if (!workspaceId) {
        throw new Error(
            `Workspace id for workspace ${config.togglWorkspace} not found. Please check your config!`,
        );
    }

    const { body } = await got.get<TogglProject[]>(
        `${config.togglUrl}/workspaces/${workspaceId}/projects`,
        {
            responseType: "json",
            username: process.env.TOGGL_API_TOKEN,
            password,
        },
    );
    return _.reduce(
        body,
        (acc: Record<number, string>, project: TogglProject) => {
            acc[project.id] = project.name;
            return acc;
        },
        {},
    );
}

export async function getTimeEntries(dateToBook: moment.Moment): Promise<TimeEntry[]> {
    // copy dateToBook to prevent mutation of reference by adding one day below.
    const dataToBookCopy = dateToBook.clone();
    const dict = await getProjectsIdToNameDict();
    const toTogglDate = (date: moment.Moment) => date.format("YYYY-MM-DD");
    const toggleDateStart = toTogglDate(dataToBookCopy);
    const toggleDateEnd = toTogglDate(dataToBookCopy.add(1, "day"));
    const { body } = await got.get<TogglRawTimeEntry[]>(
        `${config.togglUrl}/me/time_entries`,
        {
            responseType: "json",
            username: process.env.TOGGL_API_TOKEN,
            password,
            searchParams: {
                start_date: toggleDateStart,
                end_date: toggleDateEnd,
            },
        },
    );
    return _.map(body, (entry: TogglRawTimeEntry): TimeEntry => ({
        description: entry.description,
        project: entry.project_id != null ? dict[entry.project_id] : undefined,
        duration: entry.duration,
    }));
}

export function convertToWorkLogEntries(timeEntries: TimeEntry[]): WorkLogEntry[] {
    const knownProjects = _.map(config.issues, (issue) => issue.name);
    const entriesWithIssueKey = _.map(timeEntries, (entry) => {
        let issueKey: string | undefined;
        if (entry.project && knownProjects.includes(entry.project)) {
            issueKey = _.find(config.issues, ["name", entry.project])?.value;
        } else {
            const regex = new RegExp(
                `(.*)((?:${config.jiraProjectKeys.join("|")})-\\d+)\\s*(.*)`,
                "i",
            );
            const matches = entry.description.match(regex);
            if (matches) {
                issueKey = matches[2].toUpperCase();
                entry = { ...entry, description: matches[3] };
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
            description: createDescription(entryGroup, "description") as string,
        };
    });
    return _.values(result);
}
