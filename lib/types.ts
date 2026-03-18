export interface Issue {
    name: string;
    value: string;
}

export interface WorkLogEntry {
    issueKey: string;
    durationMin: number;
    description: string;
}

export interface TimeEntry {
    description: string;
    project: string | undefined;
    duration: number;
}

export interface Credentials {
    user: string;
    password: string;
}

export type AuthorizationResult = Credentials | string;

export interface AuthDefaults {
    user?: string;
    password?: string;
    token?: string;
}

export interface TogglRawTimeEntry {
    id: number;
    workspace_id: number;
    project_id: number | null;
    task_id: number | null;
    billable: boolean;
    start: string;
    stop: string;
    duration: number;
    description: string;
    tags: string[] | null;
    tag_ids: number[] | null;
    duronly: boolean;
    at: string;
    server_deleted_at: string | null;
    user_id: number;
    uid: number;
    wid: number;
    pid: number | null;
}

export interface TogglProject {
    id: number;
    name: string;
}

export interface TogglWorkspace {
    id: number | string;
    name: string;
}

export interface PostToJiraOptions {
    issueKey: string;
    timeSpent: string;
    message: string;
}
