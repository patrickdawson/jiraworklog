import axios from "axios";
import type { Dayjs } from "dayjs";
import config from "../config.json" with { type: "json" };
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
    await axios.post(
        `${config.jiraUrl}/rest/api/latest/issue/${issueKey}/worklog`,
        postData,
        authConfig,
    );
}
