const nock = require("nock");
const moment = require("moment");
const inquirer = require("inquirer");
const conf = require("conf");
const testModule = require("../lib/run");
const credentials = require("../lib/credentials");
const config = require("../config.json");

moment.locale("de");

jest.mock("inquirer");
jest.mock("conf");
jest.mock("../lib/credentials");
jest.mock("../config.json");

const consoleLogMock = jest.fn();
global.console.log = consoleLogMock;
const consoleErrorMock = jest.fn();
global.console.error = consoleErrorMock;

describe("run test", () => {
    let postScope;

    beforeAll(() => {
        config.jiraUrl = "http://jira";
        config.issues = [{ name: "Sonstiges", value: "TXR-13128" }];
    });

    beforeEach(() => {
        jest.useFakeTimers("legacy")
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    beforeEach(() => {
        credentials.getCredentials.mockResolvedValue({ user: "user1" });

        const dayToBook = moment()
            .subtract(moment().weekday() === 0 ? 3 : 1, "days");
        
        inquirer.prompt.mockResolvedValueOnce({
            dayToBook: dayToBook.format("dddd[,] LL"),
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

    describe("credentials", () => {
        beforeEach(() => {
            process.env["JIRA_PASS"] = "pass1";
            conf.mock.instances[0].get.mockImplementation(val =>
                val === "user" ? "user1" : undefined,
            );
        });

        it("calls getCredentials with configstore user and JIRA_PASS env var", async () => {
            await testModule.run();
            expect(credentials.getCredentials).toHaveBeenCalledWith({
                user: "user1",
                password: "pass1",
            });
        });

        it("sets returned user of getCredentials into configstore", async () => {
            credentials.getCredentials.mockResolvedValue({ user: "newUser" });
            await testModule.run();
            expect(conf.mock.instances[0].set).toHaveBeenCalledWith("user", "newUser");
        });
    });

    describe("getIssueKeyByName", () => {
        it("gets key by name if available", async () => {
            const key = await testModule.getIssueKeyByName("Sonstiges");
            expect(key).toEqual("TXR-13128");
        });

        it("rejects if name is not found", function() {
            expect(() => testModule.getIssueKeyByName("na")).toThrow(/not found/);
        });
    });

    describe("jira interaction", () => {
        it("posts worklog to jira", async () => {
            await testModule.run();
            expect(consoleErrorMock).toHaveBeenCalledTimes(0);
            expect(postScope.pendingMocks()).toHaveLength(0);
        });
    });
});
