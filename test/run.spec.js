const path = require("path");
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

describe("run test", () => {
    let postScope;

    beforeAll(() => {
        config.jiraUrl = "http://jira";
        config.issues = [{ name: "Sonstiges", value: "TXR-13128" }];
    });

    beforeEach(() => {
        credentials.getCredentials.mockResolvedValue({ user: "user1" });
        inquirer.prompt.mockResolvedValue({
            issueSelection: "TXR-1234",
        });
        postScope = nock("http://jira")
            .post("/jira/rest/api/latest/issue/TXR-1234/worklog")
            .reply(200);

        consoleLogMock.mockClear();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe("Welcome message", () => {
        it("prints out the welcome message", async () => {
            await testModule.run();
            expect(consoleLogMock).toHaveBeenCalledWith(
                expect.stringMatching(/.*Wilkommen beim JIRA worklog tool\..*/),
            );
        });

        it("prints out the correct datePast information", async () => {
            jest.useFakeTimers();
            const datePast = moment()
                .subtract(moment().weekday() === 0 ? 3 : 1, "days")
                .format("dddd[,] LL");
            await testModule.run();
            expect(consoleLogMock).toHaveBeenCalledWith(
                expect.stringMatching(
                    new RegExp(`.*Buchen auf "gestern" bezieht sich auf den "${datePast}"\..*`),
                ),
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
            expect(postScope.pendingMocks()).toHaveLength(0);
        });
    });
});
