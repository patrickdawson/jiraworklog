import _ from "lodash";
import inquirer from "inquirer";
import moment from "moment";
import type { Moment } from "moment";
import axios from "axios";
import Conf from "conf";
import fuzzy from "fuzzy";
import { table } from "table";
import autocompletePrompt from "inquirer-autocomplete-prompt";
import { getAuthorization } from "./auth.js";
import { getTimeEntries, convertToWorkLogEntries } from "./toggl.js";
import config from "../config.json" with { type: "json" };
import type { Authorization, ConfSchema, WorkLogEntry } from "./types.js";

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
const configstore = new Conf<ConfSchema>();
moment.locale("de");

inquirer.registerPrompt("autocomplete", autocompletePrompt);

const expandIssue = (value: string): string => (/^[0-9].*/.test(value) ? `TXR-${value}` : value);

/**
 * Returns the last issues.
 */
const getLastIssues = (): string[] => configstore.get("lastIssues") ?? [];

/**
 * Get all issues including the last issues
 * @param getKeys Optional flag to get Issue keys instead of issue names for issues from configuration.
 */
const getAllIssues = (getKeys?: boolean): string[] => [
    ...getLastIssues(),
    ..._.map(config.issues, (i) => (getKeys ? i.value : i.name)),
];

/**
 * Get issue key by searching for its name.
 * @param name Name of issue to search for key.
 */
const getIssueKeyByName = (name: string): string => {
    const issue = _.find(config.issues, ["name", name]);
    if (!_.isNil(issue)) {
        return issue.value;
    }
    throw new Error(`Issue with name '${name}' not found!`);
};

/**
 * Search function for inquirer autocomplete prompt.
 * @param _answersSoFar - Not used.
 * @param input - User input.
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

const getDateToBook = async (): Promise<Moment> => {
    const dateToObject = (date: Moment) => ({ date, text: date.format("dddd[,] LL") });
    const createDayIndices = (count: number) => [...Array(count).keys()];
    const dayIndexToDateObjMapper = (i: number) => dateToObject(moment().subtract(i, "day"));

    const lastDays = createDayIndices(config.maxLastDays || 10).map(dayIndexToDateObjMapper);

    const lastWorkdayIdx = moment().weekday() === 0 ? 3 : 1;

    const answers = await inquirer.prompt([
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
 * @param issue - The issue to add
 */
const addToLastIssues = (issue: string): void => {
    const lastIssues = getLastIssues();
    // remove entry if it is already existing
    const idx = lastIssues.findIndex((v) => v === issue);
    if (idx >= 0) {
        lastIssues.splice(idx, 1);
    }
    // add issue as first element in list
    lastIssues.unshift(issue);
    // trim list to maxLastIssues
    if (lastIssues.length > config.maxLastIssues) {
        lastIssues.splice(config.maxLastIssues);
    }
    // save lastIssues
    configstore.set(
        "lastIssues",
        lastIssues.filter((v) => !!v),
    );
};

async function postToJira(
    {
        issueKey,
        timeSpent,
        message,
    }: { issueKey: string; timeSpent: string; message: string | undefined },
    dateToBook: Moment,
    authorization: Authorization,
): Promise<void> {
    const issue = issueKey;
    const postData = {
        timeSpent,
        started: dateToBook.toISOString().replace("Z", "+0000"),
        comment: message,
    };

    console.log(`Book: '${JSON.stringify(postData)}' on issue '${issue}'`);

    try {
        const authConfig =
            typeof authorization === "string"
                ? { headers: { Authorization: authorization } }
                : { auth: { username: authorization.user, password: authorization.password! } };
        await axios.post(
            `${config.jiraUrl}/rest/api/latest/issue/${issue}/worklog`,
            postData,
            authConfig,
        );
    } catch (err) {
        console.error(`Failed to add worklog: Reason: ${(err as Error).message}`);
    }
}

const addWorklog = async (authorization: Authorization, dateToBook: Moment): Promise<void> => {
    let answers = await inquirer.prompt([
        {
            type: "autocomplete" as string,
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
            when: (a: Record<string, unknown>) =>
                (a.issueSelection as string) !== getIssueKeyByName("Sonstiges"),
        },
        {
            type: "input",
            name: "message",
            message: "Buchungstext",
            default: "Emails/Confluence/Buchen",
            when: (a: Record<string, unknown>) =>
                (a.issueSelection as string) === getIssueKeyByName("Sonstiges"),
        },
    ]);

    const issue = answers.issueSelection as string;
    const allIssueKeys = getAllIssues(true);
    if (!_.includes(allIssueKeys, answers.issueSelection)) {
        addToLastIssues(issue);
    }

    await postToJira(
        {
            issueKey: issue,
            timeSpent: answers.time as string,
            message: answers.message as string | undefined,
        },
        dateToBook,
        authorization,
    );

    answers = await inquirer.prompt([
        {
            type: "confirm",
            name: "continue",
            message: "Weitere Buchung durchführen",
        },
    ]);

    if (answers.continue) {
        await addWorklog(authorization, dateToBook);
    }
};

async function importToggl(authorization: Authorization, dateToBook: Moment): Promise<void> {
    const timeEntries = await getTimeEntries(dateToBook);
    const workLogEntries = convertToWorkLogEntries(timeEntries);
    const invalidWorkLogEntries = _.remove(
        workLogEntries,
        (w: WorkLogEntry) => w.issueKey === "undefined",
    );
    const issueKeyToProject = _.mapValues(_.keyBy(config.issues, "value"), "name");
    const tableContent = _.map(workLogEntries, (entry: WorkLogEntry) => {
        const project = issueKeyToProject[entry.issueKey] || "Custom";
        return [entry.issueKey, project, entry.durationMin, entry.description];
    });

    // log each workLogEntry
    console.log("\nThe following entries will be logged to Jira:");
    console.log(table([["Project", "Issue", "Duration (min)", "Message"], ...tableContent]));

    // Log workLogEntries with undefined issueKeys
    if (invalidWorkLogEntries.length > 0) {
        const invalidTableContent = _.map(invalidWorkLogEntries, (entry: WorkLogEntry) => {
            const project = "Custom";
            return [entry.issueKey, project, entry.durationMin, entry.description];
        });

        // log every invalid workLogEntry
        console.log("Won't log the following entries to Jira:");
        console.log(
            table([["Project", "Issue", "Duration (min)", "Message"], ...invalidTableContent]),
        );
    }
    const durationSum = _.sumBy(workLogEntries, "durationMin");
    console.log(`Zeit insgesamt: ${durationSum / 60} Stunden (${durationSum} Minuten)`);

    const answers = await inquirer.prompt([
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

const run = async (): Promise<void> => {
    try {
        console.log("\nWilkommen beim JIRA worklog tool.");
        const authorization = await getAuthorization({
            user: configstore.get("user"),
            password: process.env["JIRA_PASS"],
            token: process.env["JIRA_TOKEN"],
        });
        if (typeof authorization !== "string") {
            configstore.set("user", authorization.user);
        }

        const dateToBook = await getDateToBook();

        const answers = await inquirer.prompt([
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

export { run, getIssueKeyByName, addWorklog };
