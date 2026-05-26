import axios from "axios";
import type { Dayjs } from "dayjs";
import { formatAxiosOrUnknownError } from "./format-http-error.js";
import { buildJiraApiUrl, getJiraAxiosConfig } from "./jira-http.js";
import type { Authorization } from "./types.js";

export type PostWorklogParams = {
    issueKey: string;
    timeSpent: string;
    message: string | undefined;
};

export async function postWorklogToJira(
    { issueKey, timeSpent, message }: PostWorklogParams,
    dateToBook: Dayjs,
    authorization: Authorization,
): Promise<void> {
    const postData = {
        timeSpent,
        started: dateToBook.toISOString().replace("Z", "+0000"),
        ...(message ? { comment: message } : {}),
    };

    const url = buildJiraApiUrl(`/issue/${issueKey}/worklog`);

    try {
        await axios.post(url, postData, {
            ...getJiraAxiosConfig(authorization),
            maxRedirects: 0,
        });
    } catch (err) {
        throw new Error(
            `${formatAxiosOrUnknownError(err)} (URL: ${url})`,
            err instanceof Error ? { cause: err } : undefined,
        );
    }
}
