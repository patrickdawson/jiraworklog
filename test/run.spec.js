const nock = require("nock");
const moment = require("moment");
const inquirer = require("inquirer");
const conf = require("conf");
const testModule = require("../lib/run");
const auth = require("../lib/auth");
const config = require("../config.json");
const toggl = require("../lib/toggl");

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
    let postScope;
    let dayToBook;

    beforeAll(() => {
        config.jiraUrl = "http://jira";
        config.issues = [{ name: "Sonstiges", value: "TXR-13128" }];
    });

    beforeEach(() => {
        jest.useFakeTimers("legacy");
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        auth.getAuthorization.mockResolvedValue({ user: "user1" });

        dayToBook = moment().subtract(moment().weekday() === 0 ? 3 : 1, "days");

        inquirer.prompt.mockResolvedValueOnce({
            dayToBook: dayToBook.format("dddd[,] LL"),
        });
        inquirer.prompt.mockResolvedValueOnce({
            toggl: false,
        });
        inquirer.prompt.mockResolvedValueOnce({
            issueSelection: "TXR-1234",
            time: "1d",
            message: "message to book",
        });
        inquirer.prompt.mockResolvedValueOnce({
            continue: false,
        });

        postScope = nock("http://jira")
            .post("/rest/api/latest/issue/TXR-1234/worklog", () => {
                return {
                    comment: "message to book",
                    time: "1d",
                    started: dayToBook.toISOString().replace("Z", "+0000"),
                };
            })
            .reply(200);
    });

    afterEach(() => {
        nock.cleanAll();
        inquirer.prompt.mockReset();
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
            auth.getAuthorization.mockResolvedValue({ user: "newUser" });
            await testModule.run();
            expect(conf.mock.instances[0].set).toHaveBeenCalledWith("user", "newUser");
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
                inquirer.prompt.mockReset();
                inquirer.prompt.mockResolvedValueOnce({
                    dayToBook: dayToBook.format("dddd[,] LL"),
                });
                inquirer.prompt.mockResolvedValueOnce({ toggl: true });
                inquirer.prompt.mockResolvedValueOnce({ sendToJira: true });
                inquirer.prompt.mockResolvedValueOnce({ continue: false });
                toggl.getTimeEntries.mockResolvedValue([
                    { project: "Sonstiges", duration: 60, description: "Foo" },
                ]);
                toggl.convertToWorkLogEntries.mockReturnValue([
                    { issueKey: "TXR-1234", durationMin: 1, description: "Foo" },
                ]);
            });

            it("posts worklog to jira", async () => {
                await testModule.run();

                expect(consoleErrorMock).toHaveBeenCalledTimes(0);
                expect(postScope.pendingMocks()).toHaveLength(0);
            });

            it("does not post worklog to jira if sendToJira is false", async () => {
                inquirer.prompt.mockReset();
                inquirer.prompt.mockResolvedValueOnce({
                    dayToBook: dayToBook.format("dddd[,] LL"),
                });
                inquirer.prompt.mockResolvedValueOnce({ toggl: true });
                inquirer.prompt.mockResolvedValueOnce({ sendToJira: false });
                inquirer.prompt.mockResolvedValueOnce({ continue: false });

                await testModule.run();

                expect(consoleErrorMock).toHaveBeenCalledTimes(0);
                expect(postScope.pendingMocks()).toHaveLength(1);
            });

            it("does not post worklog to jira if an issueKey is undefined", async () => {
                toggl.convertToWorkLogEntries.mockReturnValue([
                    { issueKey: "undefined", durationMin: 1, description: "Foo" },
                ]);

                await testModule.run();

                expect(consoleErrorMock).toHaveBeenCalledTimes(1);
                expect(consoleErrorMock).toHaveBeenCalledWith(
                    expect.stringMatching(
                        /Detected 'undefined' issue key. There is something wrong with your configuration/,
                    ),
                );
                expect(postScope.pendingMocks()).toHaveLength(1);
            });

            it("does only post valid worklog entries to jira", async () => {
                toggl.convertToWorkLogEntries.mockReturnValue([
                    { issueKey: "TXR-1234", durationMin: 1, description: "Foo" },
                    { issueKey: "undefined", durationMin: 2, description: "Bar" },
                ]);

                await testModule.run();

                expect(consoleErrorMock).toHaveBeenCalledTimes(1);
                expect(consoleErrorMock).toHaveBeenCalledWith(
                    expect.stringMatching(
                        /Detected 'undefined' issue key. There is something wrong with your configuration/,
                    ),
                );
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
