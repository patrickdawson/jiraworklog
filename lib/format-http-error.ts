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
            const { status, statusText, data } = err.response;
            parts.push(`HTTP ${status}${statusText ? ` ${statusText}` : ""}`);
            if (data !== undefined && data !== "") {
                if (typeof data === "string") {
                    const isHtml = /<html[\s>]/i.test(data);
                    const snippet = data.slice(0, 400).replace(/\s+/g, " ").trim();
                    parts.push(
                        isHtml
                            ? `Antwort: HTML (${snippet.slice(0, 200)}…) — oft falsche URL oder Umleitung http→https`
                            : `Antwort: ${snippet}${data.length > 400 ? "…" : ""}`,
                    );
                } else {
                    const s = JSON.stringify(data);
                    parts.push(`Antwort: ${s.length > 500 ? `${s.slice(0, 500)}…` : s}`);
                }
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
