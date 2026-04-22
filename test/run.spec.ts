import nock from "nock";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import weekday from "dayjs/plugin/weekday.js";
import localizedFormat from "dayjs/plugin/localizedFormat.js";
import "dayjs/locale/de.js";

dayjs.extend(weekday);
dayjs.extend(localizedFormat);
import * as inquirerPrompts from "@inquirer/prompts";
import Conf from "conf";
import * as testModule from "../lib/run.js";
import * as auth from "../lib/auth.js";
import * as toggl from "../lib/toggl.js";
import type { AppConfig } from "../lib/types";
import { createMockConfig } from "./helpers.js";

dayjs.locale("de");

vi.mock("@inquirer/prompts");
vi.mock("conf");
vi.mock("../lib/auth");
vi.mock("../lib/toggl");
const config = vi.hoisted(() => ({}) as AppConfig);

vi.mock("../config.json", () => ({ default: config }));

const consoleLogMock = vi.fn();
global.console.log = consoleLogMock;
const consoleErrorMock = vi.fn();
global.console.error = consoleErrorMock;

// Typed helpers to mock individual @inquirer/prompts functions without generic inference issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSelect = () => vi.mocked(inquirerPrompts.select) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockConfirm = () => vi.mocked(inquirerPrompts.confirm) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockInput = () => vi.mocked(inquirerPrompts.input) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSearch = () => vi.mocked(inquirerPrompts.search) as any;

describe("run test", () => {
    let postScope: nock.Scope;
    let summaryPostScope: nock.Scope;
    let dayToBook: Dayjs;

    beforeAll(() => {
        Object.assign(
            config,
            createMockConfig({
                jiraUrl: "http://jira",
                issues: [{ name: "Sonstiges", value: "TXR-13128" }],
                addTxpiv450SummaryEntry: false,
            }),
        );
    });

    beforeEach(() => {
        config.addTxpiv450SummaryEntry = false;
        vi.mocked(auth.getAuthorization).mockResolvedValue({ user: "user1" });

        dayToBook = dayjs().subtract(dayjs().weekday() === 0 ? 3 : 1, "days");

        // Date selection
        mockSelect().mockResolvedValueOnce(dayToBook.format("dddd[,] LL"));
        // Toggl question (false = manual mode), then continue question (false = stop)
        mockConfirm().mockResolvedValueOnce(false).mockResolvedValueOnce(false);
        // Issue selection
        mockSearch().mockResolvedValueOnce("TXR-1234");
        // Time input, then message input (non-Sonstiges branch)
        mockInput().mockResolvedValueOnce("1d").mockResolvedValueOnce("message to book");

        postScope = nock("http://jira")
            .post("/rest/api/latest/issue/TXR-1234/worklog")
            .reply(201, { id: "10001" });
        summaryPostScope = nock("http://jira")
            .post(`/rest/api/latest/issue/${config.togglImportSummaryIssueKey}/worklog`)
            .reply(201, { id: "10002" });
    });

    afterEach(() => {
        nock.cleanAll();
        mockSelect().mockReset();
        mockConfirm().mockReset();
        mockSearch().mockReset();
        mockInput().mockReset();
        consoleLogMock.mockClear();
        consoleErrorMock.mockClear();
    });

    describe("Welcome message", () => {
        it("prints out the welcome message", async () => {
            await testModule.run();
            expect(consoleLogMock).toHaveBeenCalledWith(
                expect.stringMatching(/.*Wilkommen beim JIRA worklog tool\..*/),
            );
        });
    });

    describe("auth", () => {
        it("sets returned user of getCredentials into configstore", async () => {
            vi.mocked(auth.getAuthorization).mockResolvedValue({ user: "newUser" });
            await testModule.run();
            expect(vi.mocked(Conf).mock.instances[0].set).toHaveBeenCalledWith("user", "newUser");
        });
    });

    describe("getIssueKeyByName", () => {
        it("gets key by name if available", async () => {
            const key = await testModule.getIssueKeyByName("Sonstiges");
            expect(key).toEqual("TXR-13128");
        });

        it("rejects if name is not found", function () {
            expect(() => testModule.getIssueKeyByName("na")).toThrow(/not found/);
        });
    });

    describe("run", () => {
        describe("manual modle", () => {
            it("posts worklog to jira", async () => {
                await testModule.run();
                expect(consoleErrorMock).toHaveBeenCalledTimes(0);
                expect(postScope.pendingMocks()).toHaveLength(0);
            });
        });

        describe("toggl mode", () => {
            beforeEach(() => {
                mockSelect().mockReset();
                mockConfirm().mockReset();
                mockSearch().mockReset();
                mockInput().mockReset();

                mockSelect().mockResolvedValueOnce(dayToBook.format("dddd[,] LL"));
                // toggl: true, then sendToJira: true
                mockConfirm().mockResolvedValueOnce(true).mockResolvedValueOnce(true);

                vi.mocked(toggl.getTimeEntries).mockResolvedValue([
                    { project: "Sonstiges", duration: 60, description: "Foo" },
                ]);
                vi.mocked(toggl.convertToWorkLogEntries).mockReturnValue([
                    { issueKey: "TXR-1234", durationMin: 1, description: "Foo" },
                ]);
            });

            it("posts worklog to jira", async () => {
                await testModule.run();

                expect(consoleErrorMock).toHaveBeenCalledTimes(0);
                expect(postScope.pendingMocks()).toHaveLength(0);
                expect(summaryPostScope.pendingMocks()).toHaveLength(1);
            });

            it("does not post worklog to jira if sendToJira is false", async () => {
                mockConfirm().mockReset();
                mockConfirm().mockResolvedValueOnce(true).mockResolvedValueOnce(false);

                await testModule.run();

                expect(consoleErrorMock).toHaveBeenCalledTimes(0);
                expect(postScope.pendingMocks()).toHaveLength(1);
                expect(summaryPostScope.pendingMocks()).toHaveLength(1);
            });

            it("does not post worklog to jira if an issueKey is undefined", async () => {
                vi.mocked(toggl.convertToWorkLogEntries).mockReturnValue([
                    { issueKey: "undefined", durationMin: 1, description: "Foo" },
                ]);

                await testModule.run();

                expect(postScope.pendingMocks()).toHaveLength(1);
                expect(summaryPostScope.pendingMocks()).toHaveLength(1);
            });

            it("does only post valid worklog entries to jira", async () => {
                vi.mocked(toggl.convertToWorkLogEntries).mockReturnValue([
                    { issueKey: "TXR-1234", durationMin: 1, description: "Foo" },
                    { issueKey: "undefined", durationMin: 2, description: "Bar" },
                ]);

                await testModule.run();

                expect(postScope.pendingMocks()).toHaveLength(0);
                expect(summaryPostScope.pendingMocks()).toHaveLength(1);
            });

            it("posts an additional summary booking when enabled", async () => {
                config.addTxpiv450SummaryEntry = true;

                await testModule.run();

                expect(postScope.pendingMocks()).toHaveLength(0);
                expect(summaryPostScope.pendingMocks()).toHaveLength(0);
            });

            it("prints summary of worklog entries", async () => {
                await testModule.run();

                expect(consoleLogMock).toHaveBeenCalledWith(
                    expect.stringMatching(/TXR-1234 │ Custom │ 1/),
                );
                expect(consoleLogMock).toHaveBeenCalledWith(
                    expect.stringMatching(/Zeit insgesamt: 0.01.*Stunden \(1 Minuten\)/),
                );
            });
        });
    });
});
