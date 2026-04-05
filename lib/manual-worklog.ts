import _ from "lodash";
import type { Dayjs } from "dayjs";
import { postWorklogToJira } from "./jira-worklog.js";
import { addToLastIssues, getAllIssues } from "./issues.js";
import type { Authorization } from "./types.js";

export type ManualWorklogInput = {
    issueKey: string;
    timeSpent: string;
    message: string | undefined;
};

export async function submitManualWorklog(
    authorization: Authorization,
    dateToBook: Dayjs,
    input: ManualWorklogInput,
): Promise<void> {
    const allIssueKeys = getAllIssues(true);
    if (!_.includes(allIssueKeys, input.issueKey)) {
        addToLastIssues(input.issueKey);
    }
    await postWorklogToJira(
        {
            issueKey: input.issueKey,
            timeSpent: input.timeSpent,
            message: input.message,
        },
        dateToBook,
        authorization,
    );
}
