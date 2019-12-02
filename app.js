const inquirer = require("inquirer");
const moment = require("moment");
const rest = require("superagent");
const config = require("./config");

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

/**
 * Calculates date past. Reason: If you book on monday for the previous day you want the booking to happen on friday.
 */
const calculateDatePast = () => {
    const weekDay = moment().weekday();
    const subtractDays = weekDay === 1 ? 3 : 1;
    return moment().subtract(subtractDays, "days").toISOString();
};

const dateNow = moment().toISOString();
const datePast = calculateDatePast();


const getCredentials = async (defaults = {}) => {
    const answers = await inquirer.prompt([{
        type: "input",
        name: "user",
        message: "Für welchen Benutzer möchtest du buchen",
        when: () => !defaults.user,
    }, {
        type: "password",
        name: "password",
        message: answers => `Passwort für den Benutzer ${answers.user || defaults.user}`,
        when: () => !defaults.password,
    }]);
    return {
        user: defaults.user || answers.user,
        password: defaults.password || answers.password,
    };
};

const addWorklog = async (credentials) => {
    let localCredentials = credentials;
    let answers = await inquirer.prompt([
        {
            type: "list",
            name: "issueSelection",
            message: "Welchen Issue willst du buchen",
            choices: [
                "custom",
                { name: "Daily", value: config.daily },
                { name: "Sonstiges", value: config.sonstiges },
                { name: "Grooming", value: config.grooming },
                { name: "Iterationsabschluss", value: config.iterationsabschluss },
                { name: "Sonderbesprechung", value: config.sonderbesprechung },
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
        },
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
            .auth(localCredentials.user, localCredentials.password);
    } catch (err) {
        if (err.statusCode === 401) { // Unauthorized
            console.log("Wrong username/password given.");
            localCredentials = await getCredentials(); // no defaults. User has to type in user and password
        } else {
            console.log(`Failed to add worklog: Reason: ${err.message}`);
        }
    }

    answers = await inquirer.prompt([{
        type: "confirm",
        name: "continue",
        message: "Weitere Buchung durchführen",
    }]);

    if (answers.continue) {
        await addWorklog(localCredentials);
    }
};

(async () => {
    const credentials = await getCredentials({ user: config.user, password: process.env["JIRA_PASS"] });
    await addWorklog(credentials);
})();
