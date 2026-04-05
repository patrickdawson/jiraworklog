"use strict";

const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// In-memory store
let worklogs = [];
let nextId = 1;

// SSE clients
const sseClients = new Set();

function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
        res.write(payload);
    }
}

function parseAuth(header) {
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

function getDisplayName(header) {
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
app.get("/rest/api/2/myself", (req, res) => {
    const displayName = getDisplayName(req.headers.authorization);
    res.json({ displayName });
});

// POST /rest/api/latest/issue/:issueKey/worklog — submit worklog
app.post("/rest/api/latest/issue/:issueKey/worklog", (req, res) => {
    const { issueKey } = req.params;
    const { timeSpent, started, comment } = req.body;
    const auth = parseAuth(req.headers.authorization);

    const entry = {
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
app.get("/events", (req, res) => {
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
app.delete("/api/worklogs", (req, res) => {
    worklogs = [];
    nextId = 1;
    broadcast("clear", {});
    console.log("[-] All worklogs cleared");
    res.status(204).end();
});

app.listen(PORT, () => {
    console.log(`Jira Worklog Simulator running at http://localhost:${PORT}`);
});
