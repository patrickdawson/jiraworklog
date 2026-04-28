/// <reference types="vite/client" />

declare global {
    interface Window {
        jiraworklog: {
            login: (payload: {
                token?: string;
                user?: string;
                password?: string;
            }) => Promise<{ ok: true; user?: string } | { ok: false; error: string }>;
            logout: () => Promise<void>;
            getSession: () => Promise<{ hasAuth: boolean; user?: string }>;
            tryEnv: () => Promise<{ hasAuth: boolean }>;
            getBookingDates: () => Promise<{
                options: { text: string; iso: string }[];
                defaultIndex: number;
            }>;
            previewToggl: (isoDate: string) => Promise<import("./api-types").TogglPreviewResponse>;
            postToggl: (isoDate: string) => Promise<{ ok: boolean; errors?: string[] }>;
            submitManual: (payload: {
                isoDate: string;
                issueKey: string;
                timeSpent: string;
                message?: string;
            }) => Promise<{ ok: boolean; error?: string }>;
            searchIssues: (term: string) => Promise<{ name: string; value: string }[]>;
            getSonstigesKey: () => Promise<string>;
        };
    }
}

export {};
