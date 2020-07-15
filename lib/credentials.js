"use strict";

const rest = require("superagent");
const inquirer = require("inquirer");
const { jiraUrl } = require("../config.json");

async function checkCredentials({ user, password }) {
    try {
        const { body } = await rest.get(`${jiraUrl}/jira/rest/api/2/myself`).auth(user, password);
        console.log(`-> Hello ${body.displayName}. Your credentials are correct.`);
        return true;
    } catch (err) {
        // Unauthorized
        if (err.status === 401) {
            return false;
        } else if (err.status === 403) {
            throw new Error(
                "Jira rejected your account. Use your browser to login and solve any captcha requests.",
            );
        }
        throw err.stack;
    }
}

/**
 * Resolves with user and password configuration
 * @param {Object} defaults - The default user and password
 * @returns {Promise} Resolves with user and password
 */
const getCredentials = async (defaults = {}) => {
    const answers = await inquirer.prompt([
        {
            type: "input",
            name: "user",
            message: "Für welchen Benutzer möchtest du buchen",
            default: () => defaults.user,
        },
        {
            type: "password",
            name: "password",
            message: answers => `Passwort für den Benutzer ${answers.user || defaults.user}`,
            when: () => !defaults.password,
        },
    ]);
    const credentials = {
        user: answers.user,
        password: defaults.password || answers.password,
    };

    // re-try if credentials are wrong
    if (!(await checkCredentials(credentials))) {
        console.log("Given username / password was incorrect. Try again.");
        return await getCredentials(defaults);
    }

    return credentials;
};

module.exports = {
    getCredentials,
};
