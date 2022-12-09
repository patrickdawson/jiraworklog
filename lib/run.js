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
    console.log(table([["Project", "Issue", "Duration (min)", "Message"], ...tableContent]));

    // Log workLogEntries with undefined issueKeys
    if (invalidWorkLogEntries.length > 0) {
        console.error(
            "Detected 'undefined' issue key. There is something wrong with your configuration!",
        );
        const invalidTableContent = _.map(invalidWorkLogEntries, (entry) => {
            const project = "Custom";
            return [entry.issueKey, project, entry.durationMin, entry.description];
        });
    
        // log every invalid workLogEntry
        console.log("Won't log the following entries to Jira:");
        console.log(table([["Project", "Issue", "Duration (min)", "Message"], ...invalidTableContent]));

    }
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
