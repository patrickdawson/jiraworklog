import _ from "lodash";
import inquirer from "inquirer";
import moment from "moment";
import got from "got";
import Conf from "conf";
import fuzzy from "fuzzy";
import { table } from "table";

import { getAuthorization } from "./auth";
import { getTimeEntries, convertToWorkLogEntries } from "./toggl";
import config from "../config.json";
import type { AuthorizationResult, PostToJiraOptions } from "./types";

inquirer.registerPrompt("autocomplete", require("inquirer-autocomplete-prompt"));

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

interface ConfStore {
    lastIssues?: string[];
    user?: string;
}

const configstore = new Conf<ConfStore>();
moment.locale("de");

const expandIssue = (value: string): string =>
    /^[0-9].*/.test(value) ? `TXR-${value}` : value;

/**
 * Returns the last issues.
 */
const getLastIssues = (): string[] => (configstore.get("lastIssues") as string[] | undefined) || [];

/**
 * Get all issues including the last issues
 * @param getKeys - Optional flag to get Issue keys instead of issue names for issues from configuration.
 */
const getAllIssues = (getKeys?: boolean): string[] => [
    ...getLastIssues(),
    ..._.map(config.issues, (i) => (getKeys ? i.value : i.name)),
];

/**
 * Get issue key by searching for its name.
 */
export const getIssueKeyByName = (name: string): string => {
    const issue = _.find(config.issues, ["name", name]);
    if (!_.isNil(issue)) {
        return issue.value;
    }
    throw new Error(`Issue with name '${name}' not found!`);
};

/**
 * Search function for inquirer autocomplete prompt.
 */
const searchKnownIssues = async (_answersSoFar: unknown, input: string): Promise<string[]> => {
    input = input || "";
    const fuzzyResult = fuzzy.filter(input, getAllIssues());
    const values = _.map(fuzzyResult, (result) => result.original);
    if (input && !_.includes(values, expandIssue(input))) {
        return [...values, input];
    }
    return values;
};

const getDateToBook = async (): Promise<moment.Moment> => {
    const dateToObject = (date: moment.Moment) => ({ date, text: date.format("dddd[,] LL") });
    const createDayIndices = (count: number) => [...Array(count).keys()];
    const dayIndexToDateObjMapper = (i: number) => dateToObject(moment().subtract(i, "day"));

    const lastDays = createDayIndices(config.maxLastDays || 10).map(dayIndexToDateObjMapper);

    const lastWorkdayIdx = moment().weekday() === 0 ? 3 : 1;

    const answers = await inquirer.prompt<{ dayToBook: string }>([
        {
            type: "list",
            name: "dayToBook",
            message: "Auf welchen Tag möchtest du buchen?",
            choices: _.map(lastDays, "text"),
            default: lastWorkdayIdx,
        },
    ]);
    const selectedDate = _.find(lastDays, ["text", answers.dayToBook])!.date;

    console.log(`Sie buchen auf ${selectedDate.format("dddd[,] LL")}`);

    return selectedDate;
};

/**
 * Adds given issue to lastIssues cache.
 */
const addToLastIssues = (issue: string): void => {
    let lastIssues = getLastIssues();
    const idx = lastIssues.findIndex((v) => v === issue);
    if (idx >= 0) {
        lastIssues.splice(idx, 1);
    }
    lastIssues.unshift(issue);
    if (lastIssues.length > config.maxLastIssues) {
        lastIssues.splice(config.maxLastIssues);
    }
    configstore.set(
        "lastIssues",
        lastIssues.filter((v) => !!v),
    );
};

async function postToJira(
    { issueKey, timeSpent, message }: PostToJiraOptions,
    dateToBook: moment.Moment,
    authorization: AuthorizationResult,
): Promise<void> {
    const issue = issueKey;
    const postData = {
        timeSpent,
        started: dateToBook.toISOString().replace("Z", "+0000"),
        comment: message,
    };

    console.log(`Book: '${JSON.stringify(postData)}' on issue '${issue}'`);

    try {
        const authObject =
            typeof authorization === "string"
                ? { headers: { Authorization: authorization } }
                : {
                      username: authorization.user,
                      password: authorization.password,
                  };
        await got.post(`${config.jiraUrl}/rest/api/latest/issue/${issue}/worklog`, {
            json: postData,
            ...authObject,
        });
    } catch (err: unknown) {
        console.error(`Failed to add worklog: Reason: ${(err as Error).message}`);
    }
}

export const addWorklog = async (
    authorization: AuthorizationResult,
    dateToBook: moment.Moment,
): Promise<void> => {
    let answers = await inquirer.prompt<{
        issueSelection: string;
        time: string;
        message: string;
    }>([
        {
            type: "autocomplete",
            name: "issueSelection",
            message: "Welchen Issue willst du buchen",
            source: searchKnownIssues,
            filter: (value: string) => {
                const issueFromConfig = _.find(config.issues, ["name", value]);
                return issueFromConfig ? issueFromConfig.value : expandIssue(value);
            },
        },
        {
            type: "input",
            name: "time",
            message: "Wieviel Zeit willst du buchen",
        },
        {
            type: "input",
            name: "message",
            message: "Buchungstext (optional)",
            when: (answers: { issueSelection?: string }) =>
                answers.issueSelection !== getIssueKeyByName("Sonstiges"),
        },
        {
            type: "input",
            name: "message",
            message: "Buchungstext",
            default: "Emails/Confluence/Buchen",
            when: (answers: { issueSelection?: string }) =>
                answers.issueSelection === getIssueKeyByName("Sonstiges"),
        },
    ]);

    const issue = answers.issueSelection;
    const allIssueKeys = getAllIssues(true);
    if (!_.includes(allIssueKeys, answers.issueSelection)) {
        addToLastIssues(issue);
    }

    await postToJira(
        {
            issueKey: issue,
            timeSpent: answers.time,
            message: answers.message,
        },
        dateToBook,
        authorization,
    );

    answers = await inquirer.prompt<{ issueSelection: string; time: string; message: string }>([
        {
            type: "confirm",
            name: "continue",
            message: "Weitere Buchung durchführen",
        },
    ]);

    if ((answers as unknown as { continue: boolean }).continue) {
        await addWorklog(authorization, dateToBook);
    }
};

async function importToggl(
    authorization: AuthorizationResult,
    dateToBook: moment.Moment,
): Promise<void> {
    const timeEntries = await getTimeEntries(dateToBook);
    const workLogEntries = convertToWorkLogEntries(timeEntries);
    const invalidWorkLogEntries = _.remove(workLogEntries, (w) => w.issueKey === "undefined");
    const issueKeyToProject = _.mapValues(_.keyBy(config.issues, "value"), "name");
    const tableContent = _.map(workLogEntries, (entry) => {
        const project = issueKeyToProject[entry.issueKey] || "Custom";
        return [entry.issueKey, project, entry.durationMin, entry.description];
    });

    console.log("\nThe following entries will be logged to Jira:");
    console.log(table([["Project", "Issue", "Duration (min)", "Message"], ...tableContent]));

    if (invalidWorkLogEntries.length > 0) {
        const invalidTableContent = _.map(invalidWorkLogEntries, (entry) => {
            const project = "Custom";
            return [entry.issueKey, project, entry.durationMin, entry.description];
        });

        console.log("Won't log the following entries to Jira:");
        console.log(
            table([["Project", "Issue", "Duration (min)", "Message"], ...invalidTableContent]),
        );
    }
    const durationSum = _.sumBy(workLogEntries, "durationMin");
    console.log(`Zeit insgesamt: ${durationSum / 60} Stunden (${durationSum} Minuten)`);

    const answers = await inquirer.prompt<{ sendToJira: boolean }>([
        {
            type: "confirm",
            name: "sendToJira",
            message: "Soll die Buchung in Jira durchgeführt werden?",
        },
    ]);
    if (answers.sendToJira) {
        for (const workLogEntry of workLogEntries) {
            await postToJira(
                {
                    issueKey: workLogEntry.issueKey,
                    timeSpent: `${workLogEntry.durationMin}m`,
                    message: workLogEntry.description,
                },
                dateToBook,
                authorization,
            );
        }
    }
}

export const run = async (): Promise<void> => {
    try {
        console.log("\nWilkommen beim JIRA worklog tool.");
        const authorization = await getAuthorization({
            user: configstore.get("user") as string | undefined,
            password: process.env["JIRA_PASS"],
            token: process.env["JIRA_TOKEN"],
        });
        if (typeof authorization !== "string") {
            configstore.set("user", authorization.user);
        }

        const dateToBook = await getDateToBook();

        const answers = await inquirer.prompt<{ toggl: boolean }>([
            {
                type: "confirm",
                name: "toggl",
                message: "Soll die Zeit von Toggl importiert werden?",
                default: true,
            },
        ]);
        if (answers.toggl) {
            await importToggl(authorization, dateToBook);
        } else {
            await addWorklog(authorization, dateToBook);
        }
    } catch (error) {
        console.error(error);
    }
};
