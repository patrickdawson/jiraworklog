const path = require("path");
const nock = require("nock");
const run = require("inquirer-test");
const moment = require("moment");

const { UP, DOWN, ENTER } = run;
const cliPath = path.join(__dirname, "../app.js");
moment.locale('de');

describe("jiraworklog test", () => {
    beforeEach(() => {
        nock("https://zue-s-210")
            .post(/\/jira\/rest\/api\/latest\/issue\/.+\/worklog/)
            .reply(200);
    });

    afterEach(() => {
        nock.cleanAll();
    });

    it("prints out the welcome message", async () => {
        const result = await run([cliPath], []);
        expect(result).toMatch(/.*Wilkommen beim JIRA worklog tool\..*/);
    });

    it("prints out the correct datePast information", async () => {
        jest.useFakeTimers();
        const datePast = moment().subtract((moment().weekday() === 0 ? 3 : 1), "days").format("dddd[,] LL");
        const result = await run([cliPath], []);
        expect(result).toMatch(new RegExp(`.*Buchen auf "gestern" bezieht sich auf den "${datePast}"\..*`));
    });
});