export interface ConfigIssue {
    name: string;
    value: string;
}

export interface AppConfig {
    issues: ConfigIssue[];
    maxLastIssues: number;
    maxLastDays: number;
    jiraUrl: string;
    togglUrl: string;
    togglWorkspace: string;
    jiraProjectKeys: string[];
}

export interface TogglTimeEntry {
    description: string;
    project: string | undefined;
    duration: number;
}

export interface WorkLogEntry {
    issueKey: string;
    durationMin: number;
    description: string;
}

export type Authorization = string | { user: string; password?: string };

export interface AuthDefaults {
    user?: string;
    password?: string;
    token?: string;
}

export interface ConfSchema {
    user?: string;
    lastIssues?: string[];
}

// Raw Toggl API shapes
export interface TogglWorkspace {
    id: number;
    name: string;
}

export interface TogglProject {
    id: number;
    name: string;
    workspace_id: number;
}

export interface TogglApiTimeEntry {
    id: number;
    workspace_id: number;
    project_id: number | null;
    description: string;
    duration: number;
    start: string;
    stop: string;
}

export type ProjectIdToNameDict = Record<number, string>;
