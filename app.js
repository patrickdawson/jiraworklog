const inquirer = require("inquirer");
const moment = require("moment");
const rest = require("superagent");
const config = require("./config");

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

const dateNow = moment().toISOString();
const datePast = moment().subtract(1, "days").toISOString();

const addWorklog = async () => {
    let answers = await inquirer.prompt([
        {
            type: "list",
            name: "issueSelection",
            message: "Welchen Issue willst du buchen",
            choices: [
                { name: "Sonstiges", value: config.sonstiges },
                { name: "Daily", value: config.daily },
                { name: "Iterationsabschluss", value: config.iterationsabschluss },
                "custom",
            ],
        },
        {
            type: "input",
            name: "issue",
            when: answers => answers.issueSelection === "custom",
            filter: value => `TXR-${value}`,
        },
        {
            type: "input",
            name: "time",
            message: "Wieviel Zeit willst du buchen",
        },
        {
            type: "confirm",
            name: "bookYesterday",
            message: "Soll die Buchung auf den gestrigen Tag?",
        }
    ]);

    answers.date = answers.bookYesterday ? datePast : dateNow;
    let issue = answers.issueSelection !== "custom" ? answers.issueSelection : answers.issue;

    const postData = {
        timeSpent: answers.time,
        started: answers.date.replace("Z", "+0000"),
    };

    console.log(postData);

    try {
        await rest.post(`https://zue-s-210/jira/rest/api/latest/issue/${issue}/worklog`, postData)
            .auth(config.user, process.env["JIRA_PASS"]);
    } catch (err) {
        console.log(`Failed to add worklog: Reason: ${err.message}`);
    }

    answers = await inquirer.prompt([{
        type: "confirm",
        name: "continue",
        message: "Weitere Buchung durchführen",
    }]);

    if (answers.continue) {
        await addWorklog();
    }
};

(async () => {
    await addWorklog();
})();
