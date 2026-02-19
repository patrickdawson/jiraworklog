const nock = require("nock");
const moment = require("moment");
const testModule = require("../lib/toggl");
const config = require("../config.json");

jest.mock("../config.json");

const dateStart = moment("2022-01-01");
const dateEnd = moment("2022-01-02");

function createTogglGetWorkspacesScope(
    replyStatus = 200,
    replyValue = [{ name: "Zwick", id: "123" }],
) {
    return nock("http://toggl")
        .get("/workspaces")
        .basicAuth({ user: "mytoken", pass: "api_token" })
        .reply(replyStatus, replyValue);
}

function createTogglGetProjectsScope(replyStatus = 200, replyValue = []) {
    return nock("http://toggl")
        .get("/workspaces/123/projects")
        .basicAuth({ user: "mytoken", pass: "api_token" })
        .reply(replyStatus, replyValue);
}

function createTogglGetTimeEntriesScope(replyStatus = 200, replyValue = []) {
    return nock("http://toggl")
        .get("/me/time_entries")
        .query({
            start_date: dateStart.format("YYYY-MM-DD"),
            end_date: dateEnd.format("YYYY-MM-DD"),
        })
        .basicAuth({ user: "mytoken", pass: "api_token" })
        .reply(replyStatus, replyValue);
}

describe("toggl module", () => {
    let getTogglWorkspacesScope;
    let getTogglProjectsScope;
    let getTogglTimeEntriesScope;

    beforeAll(() => {
        config.togglUrl = "http://toggl";
        config.issues = [
            { name: "Sonstiges", value: "TXR-18227" },
            { name: "Sonderbesprechung", value: "TXR-18224" },
        ];
        config.jiraProjectKeys = ["TXR", "TXAT"];
    });

    beforeEach(() => {
        process.env.TOGGL_API_TOKEN = "mytoken";
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe("getProjectsIdToNameDict", () => {
        it("gets projects from toggl", async () => {
            getTogglWorkspacesScope = createTogglGetWorkspacesScope();
            getTogglProjectsScope = createTogglGetProjectsScope();

            await testModule.getProjectsIdToNameDict();
            expect(getTogglProjectsScope.isDone()).toBeTruthy();
        });

        it("converts the returned projects to a dictionary", async () => {
            getTogglWorkspacesScope = createTogglGetWorkspacesScope();
            getTogglProjectsScope = createTogglGetProjectsScope(200, [
                { id: 1, name: "project1" },
                { id: 2, name: "project2" },
            ]);
            const result = await testModule.getProjectsIdToNameDict();
            expect(result).toEqual({
                1: "project1",
                2: "project2",
            });
        });
    });

    describe("getTimeEntries", () => {
        it("gets time entries from toggl", async () => {
            getTogglWorkspacesScope = createTogglGetWorkspacesScope();
            getTogglProjectsScope = createTogglGetProjectsScope();
            getTogglTimeEntriesScope = createTogglGetTimeEntriesScope();

            await testModule.getTimeEntries(dateStart);
            expect(getTogglTimeEntriesScope.isDone()).toBeTruthy();
        });

        it("returns an array with time entries", async () => {
            getTogglWorkspacesScope = createTogglGetWorkspacesScope();
            getTogglProjectsScope = createTogglGetProjectsScope(200, [
                { id: 11542245, name: "Sonstiges" },
            ]);
            getTogglTimeEntriesScope = createTogglGetTimeEntriesScope(200, [
                {
                    id: 2729834974,
                    workspace_id: 1124947,
                    project_id: 11542245,
                    task_id: null,
                    billable: false,
                    start: "2022-01-01T06:53:18+00:00",
                    stop: "2022-01-01T07:05:25Z",
                    duration: 727,
                    description: "Emails/Confluence",
                    tags: null,
                    tag_ids: null,
                    duronly: false,
                    at: "2022-11-15T07:05:27+00:00",
                    server_deleted_at: null,
                    user_id: 466345,
                    uid: 466345,
                    wid: 1124947,
                    pid: 11542245,
                },
            ]);
            const result = await testModule.getTimeEntries(dateStart);
            expect(result).toEqual([
                {
                    description: "Emails/Confluence",
                    project: "Sonstiges",
                    duration: 727,
                },
            ]);
        });
    });

    describe("convertToWorkLogEntries", () => {
        it("converts duration from s to min", () => {
            const result = testModule.convertToWorkLogEntries([
                {
                    description: "Emails/Confluence",
                    project: "Sonstiges",
                    duration: 67,
                },
            ]);
            expect(result).toEqual([
                {
                    issueKey: "TXR-18227",
                    durationMin: 1,
                    description: "Emails/Confluence",
                },
            ]);
        });

        it("get worklog entries for predefined projects", () => {
            const result = testModule.convertToWorkLogEntries([
                {
                    description: "Emails/Confluence",
                    project: "Sonstiges",
                    duration: 60,
                },
                {
                    description: "Videobotschaft",
                    project: "Sonstiges",
                    duration: 120,
                },
                {
                    description: "ZE Abstimmung",
                    project: "Sonderbesprechung",
                    duration: 300,
                },
            ]);
            expect(result).toEqual([
                {
                    issueKey: "TXR-18227",
                    durationMin: 3, // 60s + 120s
                    description: "Emails/Confluence, Videobotschaft",
                },
                {
                    issueKey: "TXR-18224",
                    durationMin: 5,
                    description: "ZE Abstimmung",
                },
            ]);
        });

        it("get worklog entries for jira projects", () => {
            const result = testModule.convertToWorkLogEntries([
                {
                    description: "TXR-1234 Message 1",
                    project: "Jira Task",
                    duration: 60,
                },
                {
                    description: "TXR-5678 Message 2",
                    project: "Jira Task",
                    duration: 120,
                },
                {
                    description: "TXR-5678 Message 3",
                    project: "Jira Task",
                    duration: 300,
                },
            ]);
            expect(result).toEqual([
                {
                    issueKey: "TXR-1234",
                    durationMin: 1,
                    description: "Message 1",
                },
                {
                    issueKey: "TXR-5678",
                    durationMin: 7, // 120s + 300s
                    description: "Message 2, Message 3",
                },
            ]);
        });

        it("compacts entries with the same description", () => {
            const result = testModule.convertToWorkLogEntries([
                {
                    description: "Emails/Confluence",
                    project: "Sonstiges",
                    duration: 60,
                },
                {
                    description: "Emails/Confluence",
                    project: "Sonstiges",
                    duration: 60,
                },
                {
                    description: "TXR-1234 Message 1",
                    project: "Jira Task",
                    duration: 120,
                },
                {
                    description: "TXR-1234 Message 1",
                    project: "Jira Task",
                    duration: 120,
                },
            ]);
            expect(result).toEqual([
                {
                    issueKey: "TXR-18227",
                    durationMin: 2, // 60s + 60s
                    description: "Emails/Confluence",
                },
                {
                    issueKey: "TXR-1234",
                    durationMin: 4, // 120s + 120s
                    description: "Message 1",
                },
            ]);
        });

        it("ignores issue titles (text before issue no)", () => {
            const result = testModule.convertToWorkLogEntries([
                {
                    description: "Some issue title TXR-1234 Message 1",
                    project: "Jira Task",
                    duration: 60,
                },
                {
                    description: "Title 2 TXR-5678 Message 2",
                    project: "Jira Task",
                    duration: 120,
                },
                {
                    description: "Title 2 TXR-5678",
                    project: "Jira Task",
                    duration: 180,
                },
                {
                    description: "Title 2 TXR-5678 Message 3",
                    project: "Jira Task",
                    duration: 240,
                },
            ]);
            expect(result).toEqual([
                {
                    issueKey: "TXR-1234",
                    durationMin: 1,
                    description: "Message 1",
                },
                {
                    issueKey: "TXR-5678",
                    durationMin: 9, // 120s + 180s + 240s
                    description: "Message 2, Message 3",
                },
            ]);
        });

        it("ignores toggl entries that do not conform to our convention", () => {
            const result = testModule.convertToWorkLogEntries([
                {
                    description: "Some issue title TXR-1234 Message 1",
                    project: "Unknown Project",
                    duration: 60,
                },
                {
                    description: "Other Issue TXR-5678",
                    project: "Unknown Project",
                    duration: 120,
                },
            ]);
            expect(result).toEqual([
                {
                    issueKey: "TXR-1234",
                    durationMin: 1,
                    description: "Message 1",
                },
                {
                    issueKey: "TXR-5678",
                    durationMin: 2,
                    description: "",
                },
            ]);
        });

        it("converts lowercase project keys to uppercase", () => {
            const result = testModule.convertToWorkLogEntries([
                {
                    description: "Some issue title txr-1234 Message 1",
                    project: "Jira Task",
                    duration: 60,
                },
                {
                    description: "Other Issue TXAt-5678",
                    project: "Jira Task",
                    duration: 120,
                },
            ]);
            expect(result).toEqual([
                {
                    issueKey: "TXR-1234",
                    durationMin: 1,
                    description: "Message 1",
                },
                {
                    issueKey: "TXAT-5678",
                    durationMin: 2,
                    description: "",
                },
            ]);
        });

        it("creates worklog entries for multiple jira projects", () => {
            const result = testModule.convertToWorkLogEntries([
                {
                    description: "Some issue title TXR-1234 Message 1",
                    project: "Unknown Project",
                    duration: 60,
                },
                {
                    description: "Other Issue TXAT-5678",
                    project: "Unknown Project",
                    duration: 120,
                },
            ]);
            expect(result).toEqual([
                {
                    issueKey: "TXR-1234",
                    durationMin: 1,
                    description: "Message 1",
                },
                {
                    issueKey: "TXAT-5678",
                    durationMin: 2,
                    description: "",
                },
            ]);
        });
    });
});
