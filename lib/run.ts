import _ from "lodash";
import { select, input, confirm, search } from "@inquirer/prompts";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import weekday from "dayjs/plugin/weekday.js";
import localizedFormat from "dayjs/plugin/localizedFormat.js";
import "dayjs/locale/de.js";

dayjs.extend(weekday);
dayjs.extend(localizedFormat);
import axios from "axios";
import Conf from "conf";
import fuzzy from "fuzzy";
import { table } from "table";
import { getAuthorization } from "./auth.js";
import { getTimeEntries, convertToWorkLogEntries } from "./toggl.js";
import config from "../config.json" with { type: "json" };
import type { Authorization, ConfSchema, WorkLogEntry } from "./types.js";

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
const configstore = new Conf<ConfSchema>();
dayjs.locale("de");

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

type IssueChoice = { name: string; value: string };

/**
 * Search function for the autocomplete (search) prompt.
 * Returns typed choices where `value` is always the resolved issue key.
 * @param term - User input.
 */
const searchKnownIssues = async (term: string | void): Promise<IssueChoice[]> => {
    const inputStr = term ?? "";
    const lastIssueChoices: IssueChoice[] = getLastIssues().map((k) => ({ name: k, value: k }));
    const configIssueChoices: IssueChoice[] = config.issues.map((i) => ({
        name: i.name,
        value: i.value,
    }));
    const allChoices = [...lastIssueChoices, ...configIssueChoices];

    const fuzzyResult = fuzzy.filter(
        inputStr,
        allChoices.map((c) => c.name),
    );
    const filteredNames = new Set(fuzzyResult.map((r) => r.original));
    const filtered = allChoices.filter((c) => filteredNames.has(c.name));

    if (inputStr && !filtered.some((c) => c.value === expandIssue(inputStr))) {
        return [...filtered, { name: inputStr, value: expandIssue(inputStr) }];
    }
    return filtered;
};

const getDateToBook = async (): Promise<Dayjs> => {
    const dateToObject = (date: Dayjs) => ({ date, text: date.format("dddd[,] LL") });
    const createDayIndices = (count: number) => [...Array(count).keys()];
    const dayIndexToDateObjMapper = (i: number) => dateToObject(dayjs().subtract(i, "day"));

    const lastDays = createDayIndices(config.maxLastDays || 10).map(dayIndexToDateObjMapper);
    const lastWorkdayIdx = dayjs().weekday() === 0 ? 3 : 1;

    const selectedText = await select({
        message: "Auf welchen Tag möchtest du buchen?",
        choices: lastDays.map((d) => d.text),
        default: lastDays[lastWorkdayIdx].text,
    });

    const selectedDay = _.find(lastDays, ["text", selectedText]);
    if (!selectedDay) {
        throw new Error(`Selected day "${selectedText}" not found in lastDays`);
    }

    console.log(`Sie buchen auf ${selectedDay.date.format("dddd[,] LL")}`);

    return selectedDay.date;
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
    dateToBook: Dayjs,
    authorization: Authorization,
): Promise<void> {
    const postData = {
        timeSpent,
        started: dateToBook.toISOString().replace("Z", "+0000"),
        comment: message,
    };

    console.log(`Book: '${JSON.stringify(postData)}' on issue '${issueKey}'`);

    try {
        const authConfig =
            typeof authorization === "string"
                ? { headers: { Authorization: authorization } }
                : { auth: { username: authorization.user, password: authorization.password! } };
        await axios.post(
            `${config.jiraUrl}/rest/api/latest/issue/${issueKey}/worklog`,
            postData,
            authConfig,
        );
    } catch (err) {
        console.error(`Failed to add worklog: Reason: ${(err as Error).message}`);
    }
}

const addWorklog = async (authorization: Authorization, dateToBook: Dayjs): Promise<void> => {
    const issueSelection = await search<string>({
        message: "Welchen Issue willst du buchen",
        source: searchKnownIssues,
    });

    const time = await input({ message: "Wieviel Zeit willst du buchen" });

    let message: string | undefined;
    if (issueSelection === getIssueKeyByName("Sonstiges")) {
        message = await input({ message: "Buchungstext", default: "Emails/Confluence/Buchen" });
    } else {
        const messageInput = await input({ message: "Buchungstext (optional)" });
        message = messageInput || undefined;
    }

    const allIssueKeys = getAllIssues(true);
    if (!_.includes(allIssueKeys, issueSelection)) {
        addToLastIssues(issueSelection);
    }

    await postToJira(
        { issueKey: issueSelection, timeSpent: time, message },
        dateToBook,
        authorization,
    );

    const shouldContinue = await confirm({ message: "Weitere Buchung durchführen" });
    if (shouldContinue) {
        await addWorklog(authorization, dateToBook);
    }
};

async function importToggl(authorization: Authorization, dateToBook: Dayjs): Promise<void> {
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

    const sendToJira = await confirm({ message: "Soll die Buchung in Jira durchgeführt werden?" });
    if (sendToJira) {
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

        const useToggl = await confirm({
            message: "Soll die Zeit von Toggl importiert werden?",
            default: true,
        });
        if (useToggl) {
            await importToggl(authorization, dateToBook);
        } else {
            await addWorklog(authorization, dateToBook);
        }
    } catch (error) {
        console.error(error);
    }
};

export { run, getIssueKeyByName, addWorklog };
