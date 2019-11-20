const inquirer = require("inquirer");
const moment = require("moment");
const rest = require("superagent");

const dateNow = moment().toISOString();
const datePast = moment().subtract(1, "days").toISOString();

const addWorklog = async () => {
    let answers = await inquirer.prompt([
        {
            type: "list",
            name: "issueSelection",
            message: "Welchen Issue willst du buchen",
            choices: [
                { name: "Sonstiges", value: "TXR-1" },
                { name: "Daily", value: "TXR-2" },
                { name: "Iterationsabschluss", value: "TXR-3" },
                "TXR-",
            ],
        },
        {
            type: "input",
            name: "issue",
            when: answers => answers.issueSelection === "TXR-",
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

    // const { body } = await rest.post(`${url}`);
    // console.log(JSON.stringify(body));

    answers.date = answers.bookYesterday ? datePast : dateNow
    console.log(JSON.stringify(answers));

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
