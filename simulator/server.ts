import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";

const app = express();
const PORT = 3000;

// Resolve public/ whether running via ts-node (simulator/) or compiled (simulator/dist/)
const publicDir = fs.existsSync(path.join(__dirname, "public"))
    ? path.join(__dirname, "public")
    : path.join(__dirname, "..", "public");

app.use(express.json());
app.use(express.static(publicDir));

// In-memory store
interface WorklogEntry {
    id: number;
    issueKey: string;
    timeSpent: string;
    started: string;
    comment: string;
    receivedAt: string;
    auth: string;
}

interface SimUser {
    username: string;
    password: string;
    displayName: string;
}

let worklogs: WorklogEntry[] = [];
let nextId = 1;

// User store — pre-seeded with a default test user
const users = new Map<string, SimUser>([
    ["admin", { username: "admin", password: "admin", displayName: "Admin User" }],
]);

// Allow overriding the default user via environment variables
const envUser = process.env["SIMULATOR_USER"];
const envPass = process.env["SIMULATOR_PASS"];
if (envUser && envPass) {
    users.set(envUser, {
        username: envUser,
        password: envPass,
        displayName: process.env["SIMULATOR_DISPLAY_NAME"] ?? envUser,
    });
}

function getUserList(): { username: string; displayName: string }[] {
    return Array.from(users.values()).map((u) => ({
        username: u.username,
        displayName: u.displayName,
    }));
}

function validateBasicAuth(header: string): SimUser | null {
    if (!header.startsWith("Basic ")) return null;
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) return null;
    const username = decoded.slice(0, colonIdx);
    const password = decoded.slice(colonIdx + 1);
    const user = users.get(username);
    if (!user || user.password !== password) return null;
    return user;
}

// SSE clients
const sseClients = new Set<Response>();

// Request logger — skip static assets and SSE (logged separately on connect/disconnect)
app.use((req: Request, res: Response, next) => {
    const skip =
        req.path === "/events" ||
        req.path.startsWith("/app-icon") ||
        (req.method === "GET" && !req.path.startsWith("/rest") && !req.path.startsWith("/api"));
    if (skip) return next();

    const start = Date.now();
    res.on("finish", () => {
        const ms = Date.now() - start;
        const status = res.statusCode;
        const color = status >= 400 ? "\x1b[31m" : status >= 200 ? "\x1b[32m" : "\x1b[33m";
        const reset = "\x1b[0m";
        const auth = parseAuth(req.headers.authorization);
        console.log(`${color}${status}${reset} ${req.method} ${req.path} (${auth}) ${ms}ms`);
    });
    next();
});

function broadcast(event: string, data: object): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
        res.write(payload);
    }
}

function parseAuth(header: string | undefined): string {
    if (!header) return "anonym";
    if (header.startsWith("Bearer ")) {
        const token = header.slice(7);
        return `token:${token.slice(0, 8)}…`;
    }
    if (header.startsWith("Basic ")) {
        const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
        const user = decoded.split(":")[0];
        return `basic:${user}`;
    }
    return header.slice(0, 20);
}

// GET /rest/api/2/myself — auth validation (mimics Jira: 401 on bad credentials)
app.get("/rest/api/2/myself", (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({ message: "Not authenticated" });
        return;
    }
    // Bearer tokens are accepted as-is (no user-store check needed)
    if (authHeader.startsWith("Bearer ")) {
        res.json({ displayName: "token-user" });
        return;
    }
    const user = validateBasicAuth(authHeader);
    if (!user) {
        res.status(401).json({ message: "Invalid username or password" });
        return;
    }
    res.json({ displayName: user.displayName });
});

// GET /api/users — list configured test users (passwords omitted)
app.get("/api/users", (_req: Request, res: Response) => {
    res.json(getUserList());
});

// POST /api/users — add or update a test user
app.post("/api/users", (req: Request, res: Response) => {
    const { username, password, displayName } = req.body as {
        username?: string;
        password?: string;
        displayName?: string;
    };
    if (!username || !password) {
        res.status(400).json({ message: "username and password are required" });
        return;
    }
    const user: SimUser = {
        username,
        password,
        displayName: displayName?.trim() || username,
    };
    users.set(username, user);
    broadcast("users", getUserList());
    res.status(201).json({ username, displayName: user.displayName });
});

// DELETE /api/users/:username — remove a test user
app.delete("/api/users/:username", (req: Request, res: Response) => {
    const { username } = req.params;
    if (!users.has(username)) {
        res.status(404).json({ message: "User not found" });
        return;
    }
    users.delete(username);
    broadcast("users", getUserList());
    res.status(204).end();
});

// POST /rest/api/latest/issue/:issueKey/worklog — submit worklog
app.post<{ issueKey: string }>("/rest/api/latest/issue/:issueKey/worklog", (req, res) => {
    const { issueKey } = req.params;
    const { timeSpent, started, comment } = req.body as {
        timeSpent?: string;
        started?: string;
        comment?: string;
    };
    const auth = parseAuth(req.headers.authorization);

    const entry: WorklogEntry = {
        id: nextId++,
        issueKey,
        timeSpent: timeSpent || "",
        started: started || "",
        comment: comment || "",
        receivedAt: new Date().toISOString(),
        auth,
    };

    worklogs.push(entry);
    broadcast("worklog", entry);

    console.log(`[+] Worklog: ${issueKey} | ${timeSpent} | ${started}`);
    res.status(201).json({ id: entry.id });
});

// GET /events — SSE endpoint
app.get("/events", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Send current state on connect
    res.write(`event: init\ndata: ${JSON.stringify(worklogs)}\n\n`);
    res.write(`event: users\ndata: ${JSON.stringify(getUserList())}\n\n`);

    sseClients.add(res);
    console.log(`\x1b[36m SSE\x1b[0m Client verbunden (${sseClients.size} insgesamt)`);

    req.on("close", () => {
        sseClients.delete(res);
        console.log(`\x1b[36m SSE\x1b[0m Client getrennt (${sseClients.size} verbleibend)`);
    });
});

// DELETE /api/worklogs — clear all entries
app.delete("/api/worklogs", (_req: Request, res: Response) => {
    worklogs = [];
    nextId = 1;
    broadcast("clear", {});
    console.log("[-] Alle Worklogs geloescht");
    res.status(204).end();
});

app.listen(PORT, () => {
    console.log(`Jira-Worklog-Simulator laeuft unter http://localhost:${PORT}`);
});
