import { remove, sumBy } from "lodash-es";
import type { Dayjs } from "dayjs";
import { getTimeEntries, convertToWorkLogEntries } from "./toggl.js";
import { postWorklogToJira } from "./jira-worklog.js";
import type { Authorization, WorkLogEntry } from "./types.js";
import config from "../config.json" with { type: "json" };

export type TogglImportPreview = {
    valid: WorkLogEntry[];
    invalid: WorkLogEntry[];
    totalMinutes: number;
};

/**
 * Splits converted worklog rows into postable vs invalid (undefined issue key), and sums minutes.
 */
export function partitionTogglWorkEntries(workLogEntries: WorkLogEntry[]): TogglImportPreview {
    const valid = [...workLogEntries];
    const invalid = remove(valid, (w: WorkLogEntry) => w.issueKey === "undefined");
    const totalMinutes = sumBy(valid, "durationMin");
    return { valid, invalid, totalMinutes };
}

export async function buildTogglImportPreview(dateToBook: Dayjs): Promise<TogglImportPreview> {
    const timeEntries = await getTimeEntries(dateToBook);
    const workLogEntries = convertToWorkLogEntries(timeEntries);
    return partitionTogglWorkEntries(workLogEntries);
}

export function getSummaryDurationMin(entries: WorkLogEntry[]): number {
    return sumBy(
        entries.filter((entry) => entry.issueKey !== config.togglImportSummaryIssueKey),
        "durationMin",
    );
}

export async function postTogglImportToJira(
    authorization: Authorization,
    dateToBook: Dayjs,
    preview: TogglImportPreview,
): Promise<{ errors: string[] }> {
    const errors: string[] = [];
    const summaryDurationSum = getSummaryDurationMin(preview.valid);

    for (const entry of preview.valid) {
        try {
            await postWorklogToJira(
                {
                    issueKey: entry.issueKey,
                    timeSpent: `${entry.durationMin}m`,
                    message: entry.description,
                },
                dateToBook,
                authorization,
            );
        } catch (e) {
            errors.push(`${entry.issueKey}: ${(e as Error).message}`);
        }
    }

    if (config.addTxpiv450SummaryEntry && summaryDurationSum > 0) {
        try {
            await postWorklogToJira(
                {
                    issueKey: config.togglImportSummaryIssueKey,
                    timeSpent: `${summaryDurationSum}m`,
                    message: undefined,
                },
                dateToBook,
                authorization,
            );
        } catch (e) {
            errors.push(`${config.togglImportSummaryIssueKey}: ${(e as Error).message}`);
        }
    }

    return { errors };
}
