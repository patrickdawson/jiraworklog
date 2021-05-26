const _ = require("lodash");
const inquirer = require("inquirer");
const moment = require("moment");
const rest = require("superagent");
const Conf = require("conf");
const fuzzy = require("fuzzy");

const { getCredentials } = require("./credentials");
const config = require("../config");

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
const getAllIssues = getKeys => [
    ...getLastIssues(),
    ..._.map(config.issues, i => (getKeys ? i.value : i.name)),
];

/**
 * Get issue key by searching for its name.
 * @param {string} name Name of issue to search for key.
 * @return {string} Key of issue.
 */
const getIssueKeyByName = name => {
    const issue = _.find(config.issues, ["name", name]);
    if (!_.isNil(issue)) {
        return issue.value;
    }
    throw new Error(`Issue with name '${name}' not found!`);
};

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
        return [...values, input];
    }
    return values;
};

const getDateToBook = async () => {
    const dateToObject = date => ({ date, text: date.format("dddd[,] LL") });
    const lastDays = [
        dateToObject(moment()),
        dateToObject(moment().subtract(1, "day")),
        dateToObject(moment().subtract(2, "day")),
        dateToObject(moment().subtract(3, "day")),
        dateToObject(moment().subtract(4, "day")),
        dateToObject(moment().subtract(5, "day")),
        dateToObject(moment().subtract(6, "day")),
        dateToObject(moment().subtract(7, "day")),
        dateToObject(moment().subtract(8, "day")),
        dateToObject(moment().subtract(9, "day")),
        dateToObject(moment().subtract(10, "day")),
        dateToObject(moment().subtract(11, "day")),
    ];

    const lastWorkdayIdx = moment().weekday() === 0 ? 3 : 1;

    const answers = await inquirer.prompt([
        {
            type: "list",
            name: "dayToBook",
            message: "Auf welchen Tag möchtest du buchen?",
            choices: _.map(lastDays, "text"),
            default: lastWorkdayIdx,
        },
    ]);
    const selectedDate = _.find(lastDays, ["text", answers.dayToBook]).date;

    console.log(`Sie buchen auf ${selectedDate.format("dddd[,] LL")}`);

    return selectedDate;
};

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

const addWorklog = async (credentials, dateToBook) => {
    let localCredentials = credentials;
    let answers = await inquirer.prompt([
        {
            type: "autocomplete",
            name: "issueSelection",
            message: "Welchen Issue willst du buchen",
            source: searchKnownIssues,
            filter: value => {
                const issueFromConfig = _.find(config.issues, ["name", value]);
                return issueFromConfig ? issueFromConfig.value : expandIssue(value);
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
            when: answers => answers.issueSelection !== getIssueKeyByName("Sonstiges"),
        },
        {
            type: "input",
            name: "message",
            message: "Buchungstext",
            default: "Emails/Confluence/Buchen",
            when: answers => answers.issueSelection === getIssueKeyByName("Sonstiges"),
        },
    ]);

    const issue = answers.issueSelection;
    const allIssueKeys = getAllIssues(true);
    if (!_.includes(allIssueKeys, answers.issueSelection)) {
        addToLastIssues(issue);
    }

    const postData = {
        timeSpent: answers.time,
        started: dateToBook.toISOString().replace("Z", "+0000"),
        comment: answers.message,
    };

    console.log(`Book: '${JSON.stringify(postData)}' on issue '${issue}'`);

    try {
        await rest
            .post(`${config.jiraUrl}/rest/api/latest/issue/${issue}/worklog`, postData)
            .auth(localCredentials.user, localCredentials.password);
    } catch (err) {
        console.error(`Failed to add worklog: Reason: ${err.message}`);
    }

    answers = await inquirer.prompt([
        {
            type: "confirm",
            name: "continue",
            message: "Weitere Buchung durchführen",
        },
    ]);

    if (answers.continue) {
        await addWorklog(localCredentials, dateToBook);
    }
};

const run = async () => {
    try {
        console.log("\nWilkommen beim JIRA worklog tool.");
        const credentials = await getCredentials({
            user: configstore.get("user"),
            password: process.env["JIRA_PASS"],
        });
        configstore.set("user", credentials.user);

        const dateToBook = await getDateToBook();

        await addWorklog(credentials, dateToBook);
    } catch (error) {
        console.error(error);
    }
};

module.exports = {
    run,
    getIssueKeyByName,
    addWorklog,
};
