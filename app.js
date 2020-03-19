const _ = require("lodash");
const inquirer = require("inquirer");
const moment = require("moment");
const rest = require("superagent");
const Conf = require("conf");
const fuzzy = require("fuzzy");

const { getCredentials } = require("./lib/credentials");
const config = require("./config");

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
const configstore = new Conf();
moment.locale("de");

inquirer.registerPrompt("autocomplete", require("inquirer-autocomplete-prompt"));

const expandIssue = value => (/^[0-9].*/.test(value) ? `TXR-${value}` : value);

/**
 * Returns the last issues.
 * @returns {string[]} Returns the last issues.
 */
const getLastIssues = () => configstore.get("lastIssues") || [];

/**
 * Get all issues including the last issues
 * @param {boolean} [getKeys] Optional flag to get Issue keys instead of issue names for issues from configuration.
 * @return {string[]} All issue names as string array
 */
const getAllIssues = (getKeys) => [...getLastIssues(), ..._.map(config.issues, i => (getKeys ? i.value : i.name))];

/**
 * Search function for inquirer autocomplete prompt.
 * @param {Object} answersSoFar - Not used.
 * @param {string} input - User input.
 * @return {Promise<Array>}
 */
const searchKnownIssues = async (answersSoFar, input) => {
    input = input || "";
    let fuzzyResult = fuzzy.filter(input, getAllIssues());
    const values = _.map(fuzzyResult, result => result.original);
    if (input && !_.includes(values, expandIssue(input))) {
        return [input, ...values];
    }
    return values;
};

/**
 * Calculates date past. Reason: If you book on monday for the previous day you want the booking to happen on friday.
 */
const calculateDatePast = () => {
    const weekDay = moment().weekday();
    const subtractDays = weekDay === 0 ? 3 : 1;
    return moment().subtract(subtractDays, "days");
};

const dateNow = moment();
const datePast = calculateDatePast();

/**
 * Adds given issue to lastIssues cache.
 * @param {string} issue - The issue to add
 */
const addToLastIssues = issue => {
    let lastIssues = getLastIssues();
    // remove entry if it is already existing
    const idx = lastIssues.findIndex(v => v === issue);
    if (idx >= 0) {
        lastIssues.splice(idx, 1);
    }
    // add issue as first element in list
    lastIssues.unshift(issue);
    // trim list to maxLastIssues
    if (lastIssues.length > config.maxLastIssues) {
        lastIssues.splice(config.maxLastIssues);
    }
    // save lastIssues
    configstore.set(
        "lastIssues",
        lastIssues.filter(v => !!v),
    );
};

const addWorklog = async credentials => {
    let localCredentials = credentials;
    let answers = await inquirer.prompt([
        {
            type: "autocomplete",
            name: "issueSelection",
            message: "Welchen Issue willst du buchen",
            source: searchKnownIssues,
            filter: value => {
                const issueFromConfig = _.find(config.issues, ["name", value]);
                const result = issueFromConfig ? issueFromConfig.value : expandIssue(value);
                return result;
            },
        },
        {
            type: "input",
            name: "time",
            message: "Wieviel Zeit willst du buchen",
        },
        {
            type: "input",
            name: "message",
            message: "Buchungstext (optional)",
        },
        {
            type: "confirm",
            name: "bookYesterday",
            message: "Soll die Buchung auf den gestrigen Tag?",
        },
    ]);

    const issue = answers.issueSelection;
    const allIssueKeys = getAllIssues(true);
    if (!_.includes(allIssueKeys, answers.issueSelection)) {
        addToLastIssues(issue);
    }

    const dateToBook = answers.bookYesterday ? datePast : dateNow;
    const postData = {
        timeSpent: answers.time,
        started: dateToBook.toISOString().replace("Z", "+0000"),
        comment: answers.message,
    };

    console.log(`Book: '${JSON.stringify(postData)}' on issue '${issue}'`);

    try {
        await rest
            .post(`https://zue-s-210/jira/rest/api/latest/issue/${issue}/worklog`, postData)
            .auth(localCredentials.user, localCredentials.password);
    } catch (err) {
        console.log(`Failed to add worklog: Reason: ${err.message}`);
    }

    answers = await inquirer.prompt([
        {
            type: "confirm",
            name: "continue",
            message: "Weitere Buchung durchführen",
        },
    ]);

    if (answers.continue) {
        await addWorklog(localCredentials);
    }
};

(async () => {
    try {
        console.log(
            `\nWilkommen beim JIRA worklog tool.\nBuchen auf "gestern" bezieht sich auf den "${datePast.format(
                "dddd[,] LL",
            )}".`,
        );
        const credentials = await getCredentials({ user: configstore.get("user"), password: process.env["JIRA_PASS"] });
        configstore.set("user", credentials.user);

        await addWorklog(credentials);
    } catch (error) {
        console.error(error);
    }
})();
