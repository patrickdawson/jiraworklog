import axios from "axios";

function formatJiraErrorBody(data: unknown): string | undefined {
    if (!data || typeof data !== "object") {
        return undefined;
    }
    const body = data as { errorMessages?: string[]; errors?: Record<string, string> };
    const messages = [
        ...(body.errorMessages ?? []),
        ...Object.entries(body.errors ?? {}).map(([field, msg]) => `${field}: ${msg}`),
    ].filter((m) => m.length > 0);
    return messages.length > 0 ? messages.join("; ") : undefined;
}

/**
 * Produces a readable message for logging axios/network failures (CLI is in German elsewhere).
 */
export function formatAxiosOrUnknownError(err: unknown): string {
    if (axios.isAxiosError(err)) {
        const parts: string[] = [];
        if (err.message) {
            parts.push(err.message);
        }
        if (err.response) {
            const { status, statusText, data } = err.response;
            parts.push(`HTTP ${status}${statusText ? ` ${statusText}` : ""}`);
            const jiraDetail = formatJiraErrorBody(data);
            if (jiraDetail) {
                parts.push(jiraDetail);
            }
            if ([301, 302, 303, 307, 308].includes(status)) {
                parts.push(
                    "Redirect erkannt (z.B. http→https). Bitte jiraUrl direkt auf HTTPS setzen.",
                );
            }
        } else if (err.request) {
            parts.push("Keine HTTP-Antwort vom Server (Netzwerk, Timeout, oder falsche URL).");
        }
        if (err.code) {
            parts.push(`Code: ${err.code}`);
        }
        return parts.join(" — ");
    }
    if (err instanceof Error) {
        return err.message || String(err);
    }
    return String(err);
}
