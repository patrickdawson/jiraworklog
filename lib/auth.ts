import got, { HTTPError } from "got";
import inquirer from "inquirer";
import config from "../config.json" with { type: "json" };
import type { Authorization, AuthDefaults } from "./types.js";

async function checkCredentials({
    user,
    password,
}: {
    user: string;
    password: string;
}): Promise<boolean> {
    try {
        const { body } = await got.get<{ displayName: string }>(
            `${config.jiraUrl}/rest/api/2/myself`,
            {
                responseType: "json",
                username: user,
                password,
            },
        );
        console.log(`-> Hello ${body.displayName}. Your credentials are correct.`);
        return true;
    } catch (err) {
        if (err instanceof HTTPError) {
            // Unauthorized
            if (err.response.statusCode === 401) {
                return false;
            } else if (err.response.statusCode === 403) {
                throw new Error(
                    "Jira rejected your account. Use your browser to login and solve any captcha requests.",
                    { cause: err },
                );
            }
        }
        throw err;
    }
}

/**
 * Resolves with user and password configuration
 * @param defaults - The default user and password
 * @returns Resolves with user and password or a Bearer token string
 */
const getAuthorization = async (defaults: AuthDefaults = {}): Promise<Authorization> => {
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
            message: (a: Record<string, unknown>) =>
                `Passwort für den Benutzer ${(a.user as string) || defaults.user}`,
            when: () => !defaults.password,
        },
    ]);
    const credentials = {
        user: answers.user as string,
        password: (defaults.password || (answers.password as string)) as string,
    };

    // re-try if credentials are wrong
    if (!(await checkCredentials(credentials))) {
        console.log("Given username / password was incorrect. Try again.");
        return await getAuthorization(defaults);
    }

    return credentials;
};

export { getAuthorization };
