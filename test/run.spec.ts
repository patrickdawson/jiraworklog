import nock from "nock";
import moment from "moment";
import inquirer from "inquirer";
import Conf from "conf";
import * as testModule from "../lib/run";
import * as auth from "../lib/auth";
import config from "../config.json";
import * as toggl from "../lib/toggl";

const promptMock = inquirer.prompt as unknown as jest.Mock;

moment.locale("de");

jest.mock("inquirer");
jest.mock("conf");
jest.mock("../lib/auth");
jest.mock("../lib/toggl");
jest.mock("../config.json");

const consoleLogMock = jest.fn();
global.console.log = consoleLogMock;
const consoleErrorMock = jest.fn();
global.console.error = consoleErrorMock;

describe("run test", () => {
    let postScope: nock.Scope;
    let dayToBook: moment.Moment;

    beforeAll(() => {
        (config as Record<string, unknown>).jiraUrl = "http://jira";
        (config as Record<string, unknown>).issues = [{ name: "Sonstiges", value: "TXR-13128" }];
    });

    beforeEach(() => {
        jest.useFakeTimers("legacy");
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        (auth.getAuthorization as jest.Mock).mockResolvedValue({ user: "user1" });

        dayToBook = moment().subtract(moment().weekday() === 0 ? 3 : 1, "days");

        promptMock.mockResolvedValueOnce({
            dayToBook: dayToBook.format("dddd[,] LL"),
        });
        promptMock.mockResolvedValueOnce({
            toggl: false,
        });
        promptMock.mockResolvedValueOnce({
            issueSelection: "TXR-1234",
            time: "1d",
            message: "message to book",
        });
        promptMock.mockResolvedValueOnce({
            continue: false,
        });

        postScope = nock("http://jira")
            .post("/rest/api/latest/issue/TXR-1234/worklog", () => true)
            .reply(200);
    });

    afterEach(() => {
        nock.cleanAll();
        promptMock.mockReset();
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
            (auth.getAuthorization as jest.Mock).mockResolvedValue({ user: "newUser" });
            await testModule.run();
            expect(jest.mocked(Conf).mock.instances[0].set).toHaveBeenCalledWith("user", "newUser");
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
                promptMock.mockReset();
                promptMock.mockResolvedValueOnce({
                    dayToBook: dayToBook.format("dddd[,] LL"),
                });
                promptMock.mockResolvedValueOnce({ toggl: true });
                promptMock.mockResolvedValueOnce({ sendToJira: true });
                promptMock.mockResolvedValueOnce({ continue: false });
                (toggl.getTimeEntries as jest.Mock).mockResolvedValue([
                    { project: "Sonstiges", duration: 60, description: "Foo" },
                ]);
                (toggl.convertToWorkLogEntries as jest.Mock).mockReturnValue([
                    { issueKey: "TXR-1234", durationMin: 1, description: "Foo" },
                ]);
            });

            it("posts worklog to jira", async () => {
                await testModule.run();

                expect(consoleErrorMock).toHaveBeenCalledTimes(0);
                expect(postScope.pendingMocks()).toHaveLength(0);
            });

            it("does not post worklog to jira if sendToJira is false", async () => {
                promptMock.mockReset();
                promptMock.mockResolvedValueOnce({
                    dayToBook: dayToBook.format("dddd[,] LL"),
                });
                promptMock.mockResolvedValueOnce({ toggl: true });
                promptMock.mockResolvedValueOnce({ sendToJira: false });
                promptMock.mockResolvedValueOnce({ continue: false });

                await testModule.run();

                expect(consoleErrorMock).toHaveBeenCalledTimes(0);
                expect(postScope.pendingMocks()).toHaveLength(1);
            });

            it("does not post worklog to jira if an issueKey is undefined", async () => {
                (toggl.convertToWorkLogEntries as jest.Mock).mockReturnValue([
                    { issueKey: "undefined", durationMin: 1, description: "Foo" },
                ]);

                await testModule.run();

                expect(postScope.pendingMocks()).toHaveLength(1);
            });

            it("does only post valid worklog entries to jira", async () => {
                (toggl.convertToWorkLogEntries as jest.Mock).mockReturnValue([
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
