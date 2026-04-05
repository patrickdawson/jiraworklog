import type { AppConfig } from "../lib/types";

export function createMockConfig(overrides?: Partial<AppConfig>): AppConfig {
    return {
        jiraUrl: "",
        issues: [],
        maxLastIssues: 10,
        maxLastDays: 30,
        jiraProjectKeys: [],
        togglUrl: "",
        togglWorkspace: "",
        ...overrides,
    };
}
