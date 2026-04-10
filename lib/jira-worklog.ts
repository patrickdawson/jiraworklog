import axios from "axios";
import type { Dayjs } from "dayjs";
import config from "../config.json" with { type: "json" };
import { formatAxiosOrUnknownError } from "./format-http-error.js";
import type { Authorization } from "./types.js";

/** Jira returns this shape for a created worklog (we use it to detect bogus 2xx HTML pages). */
type JiraWorklogCreated = { id: string };

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

    let response;
    try {
        response = await axios.post<JiraWorklogCreated>(url, postData, {
            ...authConfig,
            responseType: "json",
        });
    } catch (err) {
        throw new Error(
            `${formatAxiosOrUnknownError(err)} (URL: ${url})`,
            err instanceof Error ? { cause: err } : undefined,
        );
    }

    const contentType = response.headers["content-type"] ?? "";
    if (!contentType.includes("application/json")) {
        throw new Error(
            `Unerwartete Antwort von Jira (kein JSON). Prüfe jiraUrl — nutze HTTPS, wenn der Server von HTTP umleitet. Content-Type: ${contentType || "(fehlt)"} (URL: ${url})`,
        );
    }
    const body = response.data;
    if (
        body === null ||
        typeof body !== "object" ||
        typeof (body as JiraWorklogCreated).id !== "string"
    ) {
        throw new Error(
            `Unerwartete Antwort von Jira: Worklog-Antwort enthält keine worklog-id. Buchung vermutlich fehlgeschlagen. (URL: ${url})`,
        );
    }
}
