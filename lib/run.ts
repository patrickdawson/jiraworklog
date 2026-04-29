import _ from "lodash";
import { select, input, confirm, search } from "@inquirer/prompts";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import weekday from "dayjs/plugin/weekday.js";
import localizedFormat from "dayjs/plugin/localizedFormat.js";
import "dayjs/locale/de.js";

dayjs.extend(weekday);
dayjs.extend(localizedFormat);
import { table } from "table";
import { getAuthorization } from "./auth.js";
import { formatAxiosOrUnknownError } from "./format-http-error.js";
import { postWorklogToJira, type PostWorklogParams } from "./jira-worklog.js";
import {
    buildTogglImportPreview,
    postTogglImportToJira,
    getSummaryDurationMin,
} from "./toggl-import.js";
import { getBookingDateOptions, getDefaultBookingDateIndex } from "./booking-dates.js";
import {
    filterIssueChoices,
    getAllIssues,
    getIssueKeyByName,
    addToLastIssues,
    getStoredUser,
    setStoredUser,
} from "./issues.js";
import config from "../config.json" with { type: "json" };
import type { Authorization, WorkLogEntry } from "./types.js";

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
dayjs.locale("de");

const searchKnownIssues = async (term: string | void) => filterIssueChoices(term);

const formatDurationHoursMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
};

const getDateToBook = async (): Promise<Dayjs> => {
    const lastDays = getBookingDateOptions();
    const lastWorkdayIdx = getDefaultBookingDateIndex();

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

async function postToJira(
    params: PostWorklogParams,
    dateToBook: Dayjs,
    authorization: Authorization,
): Promise<void> {
    const postData = {
        timeSpent: params.timeSpent,
        started: dateToBook.toISOString().replace("Z", "+0000"),
        comment: params.message,
    };

    console.log(`Buche: '${JSON.stringify(postData)}' auf Issue '${params.issueKey}'`);

    try {
        await postWorklogToJira(params, dateToBook, authorization);
    } catch (err) {
        const detail = err instanceof Error ? err.message : formatAxiosOrUnknownError(err);
        console.error(`Worklog konnte nicht gebucht werden: ${detail}`);
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
    const {
        valid: workLogEntries,
        invalid: invalidWorkLogEntries,
        totalMinutes,
    } = await buildTogglImportPreview(dateToBook);
    const issueKeyToProject = _.mapValues(_.keyBy(config.issues, "value"), "name");
    const tableContent = _.map(workLogEntries, (entry: WorkLogEntry) => {
        const project = issueKeyToProject[entry.issueKey] || "Benutzerdefiniert";
        return [
            entry.issueKey,
            project,
            formatDurationHoursMinutes(entry.durationMin),
            entry.description,
        ];
    });

    if (config.addTxpiv450SummaryEntry) {
        const summaryDurationMin = getSummaryDurationMin(workLogEntries);
        if (summaryDurationMin > 0) {
            const summaryProject =
                issueKeyToProject[config.togglImportSummaryIssueKey] || "Benutzerdefiniert";
            tableContent.push([
                config.togglImportSummaryIssueKey,
                summaryProject,
                formatDurationHoursMinutes(summaryDurationMin),
                "(Sammelbuchung)",
            ]);
        }
    }

    console.log("\nDie folgenden Eintraege werden in Jira gebucht:");
    console.log(table([["Issue", "Projekt", "Dauer", "Beschreibung"], ...tableContent]));

    if (invalidWorkLogEntries.length > 0) {
        const invalidTableContent = _.map(invalidWorkLogEntries, (entry: WorkLogEntry) => {
            const project = "Benutzerdefiniert";
            return [
                entry.issueKey,
                project,
                formatDurationHoursMinutes(entry.durationMin),
                entry.description,
            ];
        });

        console.log("Die folgenden Eintraege werden nicht in Jira gebucht:");
        console.log(table([["Issue", "Projekt", "Dauer", "Beschreibung"], ...invalidTableContent]));
    }
    const durationSum = totalMinutes;
    const totalHours = Math.floor(durationSum / 60);
    const remainingMinutes = durationSum % 60;
    console.log(`Zeit insgesamt: ${totalHours}h ${remainingMinutes}m (${durationSum} Minuten)`);

    const sendToJira = await confirm({ message: "Soll die Buchung in Jira durchgeführt werden?" });
    if (sendToJira) {
        const { errors } = await postTogglImportToJira(authorization, dateToBook, {
            valid: workLogEntries,
            invalid: invalidWorkLogEntries,
            totalMinutes,
        });
        for (const err of errors) {
            console.error(`Worklog konnte nicht gebucht werden: ${err}`);
        }
    }
}

const run = async (): Promise<void> => {
    try {
        console.log("\nWillkommen beim JIRA Worklog Tool.");
        const authorization = await getAuthorization({
            user: getStoredUser(),
            password: process.env["JIRA_PASS"],
            token: process.env["JIRA_TOKEN"],
        });
        if (typeof authorization !== "string") {
            setStoredUser(authorization.user);
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
        console.error("Unerwarteter Fehler:", error);
    }
};

export { run, getIssueKeyByName, addWorklog };
export { submitManualWorklog } from "./manual-worklog.js";
