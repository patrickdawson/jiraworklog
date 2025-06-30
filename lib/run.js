const _ = require("lodash");
const inquirer = require("inquirer");
const moment = require("moment");
const got = require("got");
const Conf = require("conf");
const fuzzy = require("fuzzy");
const { table } = require("table");

const { getAuthorization } = require("./auth");
const { getTimeEntries, convertToWorkLogEntries } = require("./toggl");
const config = require("../config");

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
const configstore = new Conf();
moment.locale("de");

inquirer.registerPrompt("autocomplete", require("inquirer-autocomplete-prompt"));

const expandIssue = (value) => (/^[0-9].*/.test(value) ? `TXR-${value}` : value);

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
const getAllIssues = (getKeys) => [
    ...getLastIssues(),
    ..._.map(config.issues, (i) => (getKeys ? i.value : i.name)),
];

/**
 * Get issue key by searching for its name.
 * @param {string} name Name of issue to search for key.
 * @return {string} Key of issue.
 */
const getIssueKeyByName = (name) => {
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
    const values = _.map(fuzzyResult, (result) => result.original);
    if (input && !_.includes(values, expandIssue(input))) {
        return [...values, input];
    }
    return values;
};

const getDateToBook = async () => {
    const dateToObject = (date) => ({ date, text: date.format("dddd[,] LL") });
    const createDayIndices = (count) => [...Array(count).keys()];
    const dayIndexToDateObjMapper = (i) => dateToObject(moment().subtract(i, "day"));

    const lastDays = createDayIndices(config.maxLastDays || 10)
        .map(dayIndexToDateObjMapper);

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
const addToLastIssues = (issue) => {
    let lastIssues = getLastIssues();
    // remove entry if it is already existing
    const idx = lastIssues.findIndex((v) => v === issue);
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
        lastIssues.filter((v) => !!v),
    );
};

async function postToJira({ issueKey, timeSpent, message }, dateToBook, authorization) {
    const issue = issueKey;
    const postData = {
        timeSpent,
        started: dateToBook.toISOString().replace("Z", "+0000"),
        comment: message,
    };

    console.log(`Book: '${JSON.stringify(postData)}' on issue '${issue}'`);

    try {
        const authObject =
            typeof authorization === "string"
                ? { headers: { Authorization: authorization } }
                : {
                      username: authorization.user,
                      password: authorization.password,
                  };
        await got.post(`${config.jiraUrl}/rest/api/latest/issue/${issue}/worklog`, {
            json: postData,
            ...authObject,
        });
    } catch (err) {
        console.error(`Failed to add worklog: Reason: ${err.message}`);
    }
}

const addWorklog = async (authorization, dateToBook) => {
    let answers = await inquirer.prompt([
        {
            type: "autocomplete",
            name: "issueSelection",
            message: "Welchen Issue willst du buchen",
            source: searchKnownIssues,
            filter: (value) => {
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
            when: (answers) => answers.issueSelection !== getIssueKeyByName("Sonstiges"),
        },
        {
            type: "input",
            name: "message",
            message: "Buchungstext",
            default: "Emails/Confluence/Buchen",
            when: (answers) => answers.issueSelection === getIssueKeyByName("Sonstiges"),
        },
    ]);

    const issue = answers.issueSelection;
    const allIssueKeys = getAllIssues(true);
    if (!_.includes(allIssueKeys, answers.issueSelection)) {
        addToLastIssues(issue);
    }

    await postToJira(
        {
            issueKey: issue,
            timeSpent: answers.time,
            message: answers.message,
        },
        dateToBook,
        authorization,
    );

    answers = await inquirer.prompt([
        {
            type: "confirm",
            name: "continue",
            message: "Weitere Buchung durchführen",
        },
    ]);

    if (answers.continue) {
        await addWorklog(authorization, dateToBook);
    }
};

/**
 * Displays a table of work log entries with invalid or missing issue keys that will not be logged to Jira.
 * @param {Array} invalidWorkLogEntries - List of work log entries with invalid or undefined issue keys.
 */
function logEntriesWithInvalidIssueKeys(invalidWorkLogEntries) {
    if (invalidWorkLogEntries.length > 0) {
        const invalidTableContent = _.map(invalidWorkLogEntries, (entry) => {
            const project = "Custom";
            return [entry.issueKey, project, entry.durationMin, entry.description];
        });

        // log every invalid workLogEntry
        console.log("Won't log the following entries to Jira:");
        console.log(table([["Project", "Issue", "Duration (min)", "Message"], ...invalidTableContent]));

    }
}

/**
 * Posts a list of work log entries to Jira for a specified date using the provided authorization.
 * 
 * Each entry is submitted sequentially as a worklog to the corresponding Jira issue.
 * 
 * @param {Array} workLogEntries - The work log entries to post, each containing an issue key, duration in minutes, and description.
 * @param {object} dateToBook - The date to associate with the work log entries.
 * @param {object} authorization - Jira authorization credentials.
 */
async function sendLogsToJira(workLogEntries, dateToBook, authorization) {
    for (const workLogEntry of workLogEntries) {
        await postToJira(
            {
                issueKey: workLogEntry.issueKey,
                timeSpent: `${workLogEntry.durationMin}m`,
                message: workLogEntry.description,
            },
            dateToBook,
            authorization,
        );
    }
}

/**
 * Imports time entries from Toggl for a specified date and prepares them for logging in Jira.
 *
 * Fetches Toggl time entries for the given date, converts them to Jira worklog entries, displays a summary table, and prompts the user for confirmation before posting valid entries to Jira. Invalid entries with undefined issue keys are displayed separately.
 * @param {Object} authorization - Jira authorization credentials.
 * @param {Object} dateToBook - The date for which to import and log time entries.
 */
async function importToggl(authorization, dateToBook) {
    const timeEntries = await getTimeEntries(dateToBook);
    const workLogEntries = convertToWorkLogEntries(timeEntries);
    const invalidWorkLogEntries = _.remove(workLogEntries, (w) => w.issueKey === "undefined");
    const issueKeyToProject = _.mapValues(_.keyBy(config.issues, "value"), "name");
    const tableContent = _.map(workLogEntries, (entry) => {
        const project = issueKeyToProject[entry.issueKey] || "Custom";
        return [entry.issueKey, project, entry.durationMin, entry.description];
    });

    // log each workLogEntry
    console.log("\nThe following entries will be logged to Jira:");
    console.log(table([["Project", "Issue", "Duration (min)", "Message"], ...tableContent]));

    logEntriesWithInvalidIssueKeys(invalidWorkLogEntries);
    const durationSum = _.sumBy(workLogEntries, "durationMin");
    console.log(`Zeit insgesamt: ${durationSum / 60} Stunden (${durationSum} Minuten)`);

    const answers = await inquirer.prompt([
        {
            type: "confirm",
            name: "sendToJira",
            message: "Soll die Buchung in Jira durchgeführt werden?",
        },
    ]);
    if (answers.sendToJira) {
        await sendLogsToJira(workLogEntries, dateToBook, authorization);
    }
}

const run = async () => {
    try {
        console.log("\nWilkommen beim JIRA worklog tool.");
        const authorization = await getAuthorization({
            user: configstore.get("user"),
            password: process.env["JIRA_PASS"],
            token: process.env["JIRA_TOKEN"],
        });
        if (typeof authorization !== "string") {
            configstore.set("user", authorization.user);
        }

        const dateToBook = await getDateToBook();

        const answers = await inquirer.prompt([
            {
                type: "confirm",
                name: "toggl",
                message: "Soll die Zeit von Toggl importiert werden?",
                default: true,
            },
        ]);
        if (answers.toggl) {
            await importToggl(authorization, dateToBook);
        } else {
            await addWorklog(authorization, dateToBook);
        }
    } catch (error) {
        console.error(error);
    }
};

module.exports = {
    run,
    getIssueKeyByName,
    addWorklog,
};
