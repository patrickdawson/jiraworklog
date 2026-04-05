import axios from "axios";
import { input, password } from "@inquirer/prompts";
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
        const { data } = await axios.get<{ displayName: string }>(
            `${config.jiraUrl}/rest/api/2/myself`,
            {
                auth: { username: user, password },
            },
        );
        console.log(`-> Hello ${data.displayName}. Your credentials are correct.`);
        return true;
    } catch (err) {
        if (axios.isAxiosError(err)) {
            // Unauthorized
            if (err.response?.status === 401) {
                return false;
            } else if (err.response?.status === 403) {
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

    const user = await input({
        message: "Für welchen Benutzer möchtest du buchen",
        default: defaults.user,
    });
    const pwd = defaults.password ?? await password({
        message: `Passwort für den Benutzer ${user || defaults.user}`,
    });
    const credentials = { user, password: pwd };

    // re-try if credentials are wrong
    if (!(await checkCredentials(credentials))) {
        console.log("Given username / password was incorrect. Try again.");
        return await getAuthorization(defaults);
    }

    return credentials;
};

export { getAuthorization };
