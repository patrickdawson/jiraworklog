import _ from "lodash";
import type { Dayjs } from "dayjs";
import { getTimeEntries, convertToWorkLogEntries } from "./toggl.js";
import type { WorkLogEntry } from "./types.js";

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
    const invalid = _.remove(valid, (w: WorkLogEntry) => w.issueKey === "undefined");
    const totalMinutes = _.sumBy(valid, "durationMin");
    return { valid, invalid, totalMinutes };
}

export async function buildTogglImportPreview(dateToBook: Dayjs): Promise<TogglImportPreview> {
    const timeEntries = await getTimeEntries(dateToBook);
    const workLogEntries = convertToWorkLogEntries(timeEntries);
    return partitionTogglWorkEntries(workLogEntries);
}
