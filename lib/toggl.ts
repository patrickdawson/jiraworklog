import { compact, find, groupBy, map, mapValues, reduce, sumBy, uniq, values } from "lodash-es";
import axios from "axios";
import type { Dayjs } from "dayjs";
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
    uniq(compact(map(collection, key))).join(", ");

async function getProjectsIdToNameDict(): Promise<ProjectIdToNameDict> {
    const { data: workspacesData } = await axios.get<TogglWorkspace[]>(
        `${config.togglUrl}/workspaces`,
        {
            auth: { username: process.env.TOGGL_API_TOKEN!, password },
        },
    );

    const workspaceId = find(workspacesData, ["name", config.togglWorkspace])?.id;
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
    return reduce(
        body,
        (acc: ProjectIdToNameDict, project: TogglProject) => {
            acc[project.id] = project.name;
            return acc;
        },
        {},
    );
}

async function getTimeEntries(dateToBook: Dayjs): Promise<TogglTimeEntry[]> {
    const dict = await getProjectsIdToNameDict();
    const toTogglDate = (date: Dayjs) => date.format("YYYY-MM-DD");
    const toggleDateStart = toTogglDate(dateToBook);
    const toggleDateEnd = toTogglDate(dateToBook.add(1, "day"));
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
    return map(body, (entry: TogglApiTimeEntry) => ({
        description: entry.description,
        project: entry.project_id !== null ? dict[entry.project_id] : undefined,
        duration: entry.duration,
    }));
}

function convertToWorkLogEntries(timeEntries: TogglTimeEntry[]): WorkLogEntry[] {
    const knownProjects = map(config.issues, (issue) => issue.name);
    const entriesWithIssueKey = map(timeEntries, (entry) => {
        let issueKey: string | undefined;
        if (knownProjects.includes(entry.project ?? "")) {
            issueKey = find(config.issues, ["name", entry.project])?.value;
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
    const grouped = groupBy(entriesWithIssueKey, "issueKey");
    const result = mapValues(grouped, (entryGroup, key) => {
        const duration = sumBy(entryGroup, "duration");

        return {
            issueKey: key,
            durationMin: Math.floor(duration / 60),
            description: createDescription(entryGroup, "description"),
        };
    });
    return values(result);
}

// Idee: Text vor Issue No ist Titel und wird ignoriert, Text nach IssueNo wird Description
export { getProjectsIdToNameDict, getTimeEntries, convertToWorkLogEntries };
