import axios from "axios";
import type { Dayjs } from "dayjs";
import config from "../config.json" with { type: "json" };
import { formatAxiosOrUnknownError } from "./format-http-error.js";
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
        comment: message,
    };

    const authConfig =
        typeof authorization === "string"
            ? { headers: { Authorization: authorization } }
            : { auth: { username: authorization.user, password: authorization.password! } };

    const url = `${config.jiraUrl}/rest/api/latest/issue/${issueKey}/worklog`;

    try {
        await axios.post(url, postData, {
            ...authConfig,
            maxRedirects: 0,
        });
    } catch (err) {
        throw new Error(
            `${formatAxiosOrUnknownError(err)} (URL: ${url})`,
            err instanceof Error ? { cause: err } : undefined,
        );
    }
}
