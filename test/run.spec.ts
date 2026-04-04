import nock from "nock";
import moment from "moment";
import inquirer from "inquirer";
import Conf from "conf";
import * as testModule from "../lib/run.js";
import * as auth from "../lib/auth.js";
import * as toggl from "../lib/toggl.js";
import type { AppConfig } from "../lib/types";

moment.locale("de");

vi.mock("inquirer");
vi.mock("conf");
vi.mock("../lib/auth");
vi.mock("../lib/toggl");
const config = vi.hoisted(
    () =>
        ({
            jiraUrl: "",
            issues: [],
            maxLastIssues: 10,
            maxLastDays: 30,
            jiraProjectKeys: [],
            togglUrl: "",
            togglWorkspace: "",
        }) as AppConfig,
);

vi.mock("../config.json", () => ({ default: config }));

const consoleLogMock = vi.fn();
global.console.log = consoleLogMock;
const consoleErrorMock = vi.fn();
global.console.error = consoleErrorMock;

describe("run test", () => {
    let postScope: nock.Scope;
    let dayToBook: moment.Moment;

    beforeAll(() => {
        config.jiraUrl = "http://jira";
        config.issues = [{ name: "Sonstiges", value: "TXR-13128" }];
    });

    beforeEach(() => {
        vi.mocked(auth.getAuthorization).mockResolvedValue({ user: "user1" });

        dayToBook = moment().subtract(moment().weekday() === 0 ? 3 : 1, "days");

        vi.mocked(inquirer.prompt).mockResolvedValueOnce({
            dayToBook: dayToBook.format("dddd[,] LL"),
        });
        vi.mocked(inquirer.prompt).mockResolvedValueOnce({
            toggl: false,
        });
        vi.mocked(inquirer.prompt).mockResolvedValueOnce({
            issueSelection: "TXR-1234",
            time: "1d",
            message: "message to book",
        });
        vi.mocked(inquirer.prompt).mockResolvedValueOnce({
            continue: false,
        });

        postScope = nock("http://jira").post("/rest/api/latest/issue/TXR-1234/worklog").reply(200);
    });

    afterEach(() => {
        nock.cleanAll();
        vi.mocked(inquirer.prompt).mockReset();
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
                vi.mocked(inquirer.prompt).mockReset();
                vi.mocked(inquirer.prompt).mockResolvedValueOnce({
                    dayToBook: dayToBook.format("dddd[,] LL"),
                });
                vi.mocked(inquirer.prompt).mockResolvedValueOnce({ toggl: true });
                vi.mocked(inquirer.prompt).mockResolvedValueOnce({ sendToJira: true });
                vi.mocked(inquirer.prompt).mockResolvedValueOnce({ continue: false });
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
            });

            it("does not post worklog to jira if sendToJira is false", async () => {
                vi.mocked(inquirer.prompt).mockReset();
                vi.mocked(inquirer.prompt).mockResolvedValueOnce({
                    dayToBook: dayToBook.format("dddd[,] LL"),
                });
                vi.mocked(inquirer.prompt).mockResolvedValueOnce({ toggl: true });
                vi.mocked(inquirer.prompt).mockResolvedValueOnce({ sendToJira: false });
                vi.mocked(inquirer.prompt).mockResolvedValueOnce({ continue: false });

                await testModule.run();

                expect(consoleErrorMock).toHaveBeenCalledTimes(0);
                expect(postScope.pendingMocks()).toHaveLength(1);
            });

            it("does not post worklog to jira if an issueKey is undefined", async () => {
                vi.mocked(toggl.convertToWorkLogEntries).mockReturnValue([
                    { issueKey: "undefined", durationMin: 1, description: "Foo" },
                ]);

                await testModule.run();

                expect(postScope.pendingMocks()).toHaveLength(1);
            });

            it("does only post valid worklog entries to jira", async () => {
                vi.mocked(toggl.convertToWorkLogEntries).mockReturnValue([
                    { issueKey: "TXR-1234", durationMin: 1, description: "Foo" },
                    { issueKey: "undefined", durationMin: 2, description: "Bar" },
                ]);

                await testModule.run();

                expect(postScope.pendingMocks()).toHaveLength(0);
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
