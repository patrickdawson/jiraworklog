import { contextBridge, ipcRenderer } from "electron";

export type LoginPayload = { token?: string; user?: string; password?: string };

export type ManualSubmitPayload = {
    isoDate: string;
    issueKey: string;
    timeSpent: string;
    message?: string;
};

const api = {
    login: (payload: LoginPayload) => ipcRenderer.invoke("auth:login", payload),
    logout: () => ipcRenderer.invoke("auth:logout"),
    getSession: () =>
        ipcRenderer.invoke("auth:getSession") as Promise<{ hasAuth: boolean; user?: string }>,
    tryEnv: () => ipcRenderer.invoke("auth:tryEnv") as Promise<{ hasAuth: boolean }>,
    getBookingDates: () =>
        ipcRenderer.invoke("booking:getDates") as Promise<{
            options: { text: string; iso: string }[];
            defaultIndex: number;
        }>,
    previewToggl: (isoDate: string) =>
        ipcRenderer.invoke("toggl:preview", isoDate) as Promise<
            | { ok: true; preview: import("../lib/toggl-import.js").TogglImportDisplayPreview }
            | { ok: false; error: string }
        >,
    postToggl: (isoDate: string) =>
        ipcRenderer.invoke("toggl:post", isoDate) as Promise<{ ok: boolean; errors?: string[] }>,
    submitManual: (payload: ManualSubmitPayload) =>
        ipcRenderer.invoke("manual:submit", payload) as Promise<{ ok: boolean; error?: string }>,
    searchIssues: (term: string) => ipcRenderer.invoke("issues:search", term),
    getSonstigesKey: () => ipcRenderer.invoke("issues:sonstigesKey") as Promise<string>,
};

contextBridge.exposeInMainWorld("jiraworklog", api);
