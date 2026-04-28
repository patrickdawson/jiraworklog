import { ipcMain } from "electron";
import axios from "axios";
import dayjs from "dayjs";
import { resolveAuthorization } from "../lib/auth.js";
import { buildTogglImportPreview, postTogglImportToJira } from "../lib/toggl-import.js";
import { submitManualWorklog } from "../lib/manual-worklog.js";
import { getBookingDateOptions, getDefaultBookingDateIndex } from "../lib/booking-dates.js";
import {
    filterIssueChoices,
    getIssueKeyByName,
    getStoredUser,
    setStoredUser,
} from "../lib/issues.js";
import { getSessionAuth, setSessionAuth } from "./session.js";

function extractPreviewErrorMessage(err: unknown): string {
    if (axios.isAxiosError(err)) {
        const data = err.response?.data;
        if (typeof data === "string" && data.trim().length > 0) {
            return data;
        }
        if (data && typeof data === "object" && "data" in data) {
            const nestedData = (data as { data?: unknown }).data;
            if (typeof nestedData === "string" && nestedData.trim().length > 0) {
                return nestedData;
            }
        }
    }
    if (err instanceof Error && err.message.trim().length > 0) {
        return err.message;
    }
    return String(err);
}

function tryAuthFromEnv(): void {
    const token = process.env["JIRA_TOKEN"];
    if (token && !getSessionAuth()) {
        setSessionAuth(`Bearer ${token}`);
    }
}

export function registerIpcHandlers(): void {
    tryAuthFromEnv();

    ipcMain.handle(
        "auth:login",
        async (
            _,
            payload: { token?: string; user?: string; password?: string },
        ): Promise<{ ok: true; user?: string } | { ok: false; error: string }> => {
            try {
                const auth = await resolveAuthorization({
                    token: payload.token?.trim() || process.env["JIRA_TOKEN"]?.trim(),
                    user: payload.user,
                    password: payload.password,
                });
                setSessionAuth(auth);
                if (typeof auth !== "string") {
                    setStoredUser(auth.user);
                }
                return { ok: true, user: typeof auth === "string" ? undefined : auth.user };
            } catch (e) {
                return { ok: false, error: (e as Error).message };
            }
        },
    );

    ipcMain.handle("auth:logout", () => {
        setSessionAuth(null);
    });

    ipcMain.handle("auth:getSession", () => ({
        hasAuth: getSessionAuth() !== null,
        user: getStoredUser(),
    }));

    ipcMain.handle("auth:tryEnv", () => {
        tryAuthFromEnv();
        return { hasAuth: getSessionAuth() !== null };
    });

    ipcMain.handle("booking:getDates", () => {
        const options = getBookingDateOptions();
        return {
            options: options.map((o) => ({ text: o.text, iso: o.iso })),
            defaultIndex: getDefaultBookingDateIndex(),
        };
    });

    ipcMain.handle(
        "toggl:preview",
        async (
            _,
            isoDate: string,
        ): Promise<
            | { ok: true; preview: Awaited<ReturnType<typeof buildTogglImportPreview>> }
            | { ok: false; error: string }
        > => {
            try {
                const dateToBook = dayjs(isoDate);
                const preview = await buildTogglImportPreview(dateToBook);
                return { ok: true, preview };
            } catch (e) {
                return { ok: false, error: extractPreviewErrorMessage(e) };
            }
        },
    );

    ipcMain.handle(
        "toggl:post",
        async (_, isoDate: string): Promise<{ ok: boolean; errors?: string[] }> => {
            const auth = getSessionAuth();
            if (!auth) {
                return { ok: false, errors: ["Not authenticated"] };
            }
            const dateToBook = dayjs(isoDate);
            const preview = await buildTogglImportPreview(dateToBook);
            const { errors } = await postTogglImportToJira(auth, dateToBook, preview);
            return { ok: errors.length === 0, errors: errors.length ? errors : undefined };
        },
    );

    ipcMain.handle(
        "manual:submit",
        async (
            _,
            args: { isoDate: string; issueKey: string; timeSpent: string; message?: string },
        ): Promise<{ ok: boolean; error?: string }> => {
            const auth = getSessionAuth();
            if (!auth) {
                return { ok: false, error: "Not authenticated" };
            }
            try {
                const dateToBook = dayjs(args.isoDate);
                await submitManualWorklog(auth, dateToBook, {
                    issueKey: args.issueKey,
                    timeSpent: args.timeSpent,
                    message: args.message,
                });
                return { ok: true };
            } catch (e) {
                return { ok: false, error: (e as Error).message };
            }
        },
    );

    ipcMain.handle("issues:search", (_, term: string) => filterIssueChoices(term));

    ipcMain.handle("issues:sonstigesKey", () => getIssueKeyByName("Sonstiges"));
}
