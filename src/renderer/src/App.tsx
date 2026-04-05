import { useCallback, useEffect, useState } from "react";
import type { TogglImportPreview } from "./api-types";

const api = window.jiraworklog;

export function App(): JSX.Element {
    const [hasAuth, setHasAuth] = useState(false);
    const [checking, setChecking] = useState(true);
    const [token, setToken] = useState("");
    const [user, setUser] = useState("");
    const [password, setPassword] = useState("");
    const [authError, setAuthError] = useState<string | null>(null);

    const [dateOptions, setDateOptions] = useState<{ text: string; iso: string }[]>([]);
    const [defaultDateIdx, setDefaultDateIdx] = useState(1);
    const [selectedIso, setSelectedIso] = useState<string>("");

    const [useToggl, setUseToggl] = useState(true);
    const [preview, setPreview] = useState<TogglImportPreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [postMsg, setPostMsg] = useState<string | null>(null);

    const [issueQuery, setIssueQuery] = useState("");
    const [issueChoices, setIssueChoices] = useState<{ name: string; value: string }[]>([]);
    const [selectedIssueKey, setSelectedIssueKey] = useState("");
    const [timeSpent, setTimeSpent] = useState("");
    const [message, setMessage] = useState("");
    const [sonstigesKey, setSonstigesKey] = useState<string | null>(null);
    const [manualMsg, setManualMsg] = useState<string | null>(null);

    const refreshSession = useCallback(async () => {
        await api.tryEnv();
        const s = await api.getSession();
        setHasAuth(s.hasAuth);
        if (s.user) setUser(s.user);
    }, []);

    useEffect(() => {
        void (async () => {
            try {
                await refreshSession();
                const dates = await api.getBookingDates();
                setDateOptions(dates.options);
                setDefaultDateIdx(dates.defaultIndex);
                const pick = dates.options[dates.defaultIndex];
                if (pick) setSelectedIso(pick.iso);
                const sk = await api.getSonstigesKey();
                setSonstigesKey(sk);
            } finally {
                setChecking(false);
            }
        })();
    }, [refreshSession]);

    const loadPreview = useCallback(async () => {
        if (!selectedIso) return;
        setPreviewLoading(true);
        setPostMsg(null);
        try {
            const p = await api.previewToggl(selectedIso);
            setPreview(p);
        } finally {
            setPreviewLoading(false);
        }
    }, [selectedIso]);

    useEffect(() => {
        if (!hasAuth || !useToggl || !selectedIso) return;
        void loadPreview();
    }, [hasAuth, useToggl, selectedIso, loadPreview]);

    useEffect(() => {
        void (async () => {
            const list = await api.searchIssues(issueQuery);
            setIssueChoices(list);
        })();
    }, [issueQuery]);

    async function handleLogin(e: React.FormEvent): Promise<void> {
        e.preventDefault();
        setAuthError(null);
        const res = await api.login({
            token: token.trim() || undefined,
            user: user.trim() || undefined,
            password: password || undefined,
        });
        if (res.ok) {
            setPassword("");
            await refreshSession();
        } else {
            setAuthError(res.error);
        }
    }

    async function handleLogout(): Promise<void> {
        await api.logout();
        setHasAuth(false);
        setPreview(null);
    }

    async function handlePostToggl(): Promise<void> {
        if (!selectedIso) return;
        setPostMsg(null);
        const res = await api.postToggl(selectedIso);
        if (res.ok) {
            setPostMsg("Buchung in Jira durchgeführt.");
        } else {
            setPostMsg((res.errors ?? []).join("\n"));
        }
    }

    async function handleManualSubmit(e: React.FormEvent): Promise<void> {
        e.preventDefault();
        setManualMsg(null);
        if (!selectedIso || !selectedIssueKey || !timeSpent) {
            setManualMsg("Issue, Datum und Zeit sind erforderlich.");
            return;
        }
        const msg =
            selectedIssueKey === sonstigesKey
                ? message || "Emails/Confluence/Buchen"
                : message || undefined;
        const res = await api.submitManual({
            isoDate: selectedIso,
            issueKey: selectedIssueKey,
            timeSpent,
            message: msg,
        });
        if (res.ok) {
            setManualMsg("Worklog erstellt.");
            setTimeSpent("");
            setMessage("");
        } else {
            setManualMsg(res.error ?? "Fehler");
        }
    }

    if (checking) {
        return (
            <div className="loading-screen" role="status" aria-live="polite">
                <div className="spinner" aria-hidden />
                <span>Laden…</span>
            </div>
        );
    }

    return (
        <>
            <header className="app-header">
                <img
                    className="app-logo"
                    src="/app-icon.png"
                    width={52}
                    height={52}
                    alt=""
                />
                <div className="app-header-text">
                    <h1>Jira Worklog</h1>
                    <p>Toggl importieren oder manuell buchen</p>
                </div>
            </header>

            {!hasAuth ? (
                <section className="panel">
                    <div className="section-title">Anmeldung</div>
                    <p className="hint">
                        Optional: <code>JIRA_TOKEN</code> in der Umgebung. Sonst API-Token oder
                        Benutzername und Passwort.
                    </p>
                    <form onSubmit={(e) => void handleLogin(e)}>
                        <div className="row">
                            <div className="field">
                                <label htmlFor="token">Jira API-Token (PAT)</label>
                                <input
                                    id="token"
                                    type="password"
                                    autoComplete="off"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="row">
                            <div className="field">
                                <label htmlFor="user">Benutzer</label>
                                <input
                                    id="user"
                                    value={user}
                                    autoComplete="username"
                                    onChange={(e) => setUser(e.target.value)}
                                />
                            </div>
                            <div className="field">
                                <label htmlFor="pass">Passwort</label>
                                <input
                                    id="pass"
                                    type="password"
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>
                        {authError ? <p className="msg error">{authError}</p> : null}
                        <div className="btn-row">
                            <button type="submit" className="primary">
                                Anmelden
                            </button>
                        </div>
                    </form>
                </section>
            ) : (
                <>
                    <div className="panel panel--inline">
                        <span>
                            <strong>Angemeldet</strong>
                            {user ? ` · ${user}` : ""}
                        </span>
                        <button type="button" onClick={() => void handleLogout()}>
                            Abmelden
                        </button>
                    </div>

                    <section className="panel">
                        <div className="section-title">Buchungstag</div>
                        <label htmlFor="date">Kalendertag</label>
                        <select
                            id="date"
                            value={selectedIso}
                            onChange={(e) => setSelectedIso(e.target.value)}
                        >
                            {dateOptions.map((d, i) => (
                                <option key={d.iso} value={d.iso}>
                                    {d.text}
                                    {i === defaultDateIdx ? " · Vorschlag" : ""}
                                </option>
                            ))}
                        </select>
                    </section>

                    <div className="toggle">
                        <input
                            type="checkbox"
                            id="toggl"
                            checked={useToggl}
                            onChange={(e) => setUseToggl(e.target.checked)}
                        />
                        <label htmlFor="toggl">Zeit von Toggl importieren</label>
                    </div>

                    {useToggl ? (
                        <section className="panel">
                            <div className="section-title">Toggl → Jira</div>
                            <p className="hint">
                                <code>TOGGL_API_TOKEN</code> muss gesetzt sein. Die Vorschau lädt
                                automatisch bei einem neuen Buchungstag.
                            </p>
                            <div className="btn-row">
                                <button
                                    type="button"
                                    className="primary"
                                    disabled={previewLoading || !selectedIso}
                                    onClick={() => void loadPreview()}
                                >
                                    {previewLoading ? "Lade…" : "Vorschau aktualisieren"}
                                </button>
                            </div>
                            {preview ? (
                                <>
                                    <div className="section-title section-title--spaced">Gültige Einträge</div>
                                    <div className="table-wrap">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Issue</th>
                                                    <th>Min</th>
                                                    <th>Text</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {preview.valid.map((r, i) => (
                                                    <tr key={`v-${r.issueKey}-${i}-${r.description.slice(0, 20)}`}>
                                                        <td>{r.issueKey}</td>
                                                        <td>{r.durationMin}</td>
                                                        <td>{r.description}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {preview.invalid.length > 0 ? (
                                        <>
                                            <div className="section-title">Nicht buchbar</div>
                                            <p className="hint hint--tight">
                                                Kein Issue-Key erkannt (z. B. fehlendes Projekt oder
                                                Beschreibung).
                                            </p>
                                            <div className="table-wrap">
                                                <table>
                                                    <thead>
                                                        <tr>
                                                            <th>Issue</th>
                                                            <th>Min</th>
                                                            <th>Text</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {preview.invalid.map((r, i) => (
                                                            <tr
                                                                key={`inv-${r.issueKey}-${i}-${r.description.slice(0, 20)}`}
                                                            >
                                                                <td>{r.issueKey}</td>
                                                                <td>{r.durationMin}</td>
                                                                <td>{r.description}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    ) : null}
                                    <p className="msg">
                                        Summe: <strong>{preview.totalMinutes / 60}</strong> h (
                                        {preview.totalMinutes} Min)
                                    </p>
                                    <div className="btn-row">
                                        <button
                                            type="button"
                                            className="primary"
                                            onClick={() => void handlePostToggl()}
                                        >
                                            In Jira buchen
                                        </button>
                                    </div>
                                    {postMsg ? (
                                        <p
                                            className={
                                                postMsg.includes("durchgeführt")
                                                    ? "msg ok"
                                                    : "msg error"
                                            }
                                        >
                                            {postMsg}
                                        </p>
                                    ) : null}
                                </>
                            ) : null}
                        </section>
                    ) : (
                        <section className="panel">
                            <div className="section-title">Manuelle Buchung</div>
                            <form onSubmit={(e) => void handleManualSubmit(e)}>
                                <div className="field">
                                    <label htmlFor="issue">Issue suchen</label>
                                    <input
                                        id="issue"
                                        value={issueQuery}
                                        onChange={(e) => setIssueQuery(e.target.value)}
                                        placeholder="Name oder Key"
                                    />
                                </div>
                                <div className="issue-list" role="listbox" aria-label="Issue-Vorschläge">
                                    {issueChoices.map((c) => (
                                        <button
                                            key={c.value + c.name}
                                            type="button"
                                            role="option"
                                            onClick={() => {
                                                setSelectedIssueKey(c.value);
                                                setIssueQuery(c.name);
                                            }}
                                        >
                                            <strong>{c.name}</strong>
                                            <span className="issue-line-key"> · {c.value}</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="row row--tight-top">
                                    <div className="field">
                                        <label htmlFor="issueKey">Issue-Key (gebucht)</label>
                                        <input
                                            id="issueKey"
                                            value={selectedIssueKey}
                                            onChange={(e) => setSelectedIssueKey(e.target.value)}
                                        />
                                    </div>
                                    <div className="field">
                                        <label htmlFor="time">Zeit</label>
                                        <input
                                            id="time"
                                            value={timeSpent}
                                            onChange={(e) => setTimeSpent(e.target.value)}
                                            placeholder="z. B. 1h, 30m"
                                        />
                                    </div>
                                </div>
                                <div className="field">
                                    <label htmlFor="msg">Buchungstext</label>
                                    <input
                                        id="msg"
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder={
                                            selectedIssueKey === sonstigesKey
                                                ? "Standard: Emails/Confluence/Buchen"
                                                : "optional"
                                        }
                                    />
                                </div>
                                <div className="btn-row">
                                    <button type="submit" className="primary">
                                        Buchen
                                    </button>
                                </div>
                                {manualMsg ? (
                                    <p
                                        className={
                                            manualMsg.includes("erstellt") ? "msg ok" : "msg error"
                                        }
                                    >
                                        {manualMsg}
                                    </p>
                                ) : null}
                            </form>
                        </section>
                    )}
                </>
            )}

            <footer className="app-footer">CLI: npm run dev · Desktop: npm run dev:app</footer>
        </>
    );
}
