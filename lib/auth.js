"use strict";

const got = require("got");
const inquirer = require("inquirer");
const { jiraUrl } = require("../config.json");

async function checkCredentials({ user, password }) {
    try {
        const { body } = await got.get(`${jiraUrl}/rest/api/2/myself`, {
            username: user,
            password,
        });
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
 * @returns {Promise<{ user: string, password: string } | string} Resolves with user and password
 */
const getAuthorization = async (defaults = {}) => {
    if (defaults.token) {
        return `Bearer ${defaults.token}`;
    }
    
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
            message: (answers) => `Passwort für den Benutzer ${answers.user || defaults.user}`,
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
        return await getAuthorization(defaults);
    }

    return credentials;
};

module.exports = {
    getAuthorization,
};
