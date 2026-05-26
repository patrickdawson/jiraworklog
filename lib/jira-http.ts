import type { AxiosRequestConfig } from "axios";
import config from "../config.json" with { type: "json" };
import type { Authorization } from "./types.js";

export const JIRA_REST_API_PREFIX = "/rest/api/2";

export function buildJiraApiUrl(path: string): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${config.jiraUrl}${JIRA_REST_API_PREFIX}${normalized}`;
}

/** Jira Cloud: Basic auth with Atlassian account email + API token. */
export function getJiraAxiosConfig(authorization: Authorization): AxiosRequestConfig {
    return {
        auth: {
            username: authorization.user,
            password: authorization.password,
        },
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
    };
}
