import axios from "axios";

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
            const { status, statusText } = err.response;
            parts.push(`HTTP ${status}${statusText ? ` ${statusText}` : ""}`);
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
