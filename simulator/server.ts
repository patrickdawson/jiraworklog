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

let worklogs: WorklogEntry[] = [];
let nextId = 1;

// SSE clients
const sseClients = new Set<Response>();

function broadcast(event: string, data: object): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
        res.write(payload);
    }
}

function parseAuth(header: string | undefined): string {
    if (!header) return "anonymous";
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

function getDisplayName(header: string | undefined): string {
    if (!header) return "anonymous";
    if (header.startsWith("Bearer ")) {
        return "token-user";
    }
    if (header.startsWith("Basic ")) {
        const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
        return decoded.split(":")[0];
    }
    return "unknown";
}

// GET /rest/api/2/myself — auth validation
app.get("/rest/api/2/myself", (req: Request, res: Response) => {
    const displayName = getDisplayName(req.headers.authorization);
    res.json({ displayName });
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

    sseClients.add(res);

    req.on("close", () => {
        sseClients.delete(res);
    });
});

// DELETE /api/worklogs — clear all entries
app.delete("/api/worklogs", (_req: Request, res: Response) => {
    worklogs = [];
    nextId = 1;
    broadcast("clear", {});
    console.log("[-] All worklogs cleared");
    res.status(204).end();
});

app.listen(PORT, () => {
    console.log(`Jira Worklog Simulator running at http://localhost:${PORT}`);
});
