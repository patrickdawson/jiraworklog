import axios from "axios";
import { input, password } from "@inquirer/prompts";
import config from "../config.json" with { type: "json" };
import type { Authorization, AuthDefaults } from "./types.js";

type CheckCredentialsOptions = { silent?: boolean };

async function checkCredentials(
    {
        user,
        password,
    }: {
        user: string;
        password: string;
    },
    options: CheckCredentialsOptions = {},
): Promise<boolean> {
    try {
        const { data } = await axios.get<{ displayName: string }>(
            `${config.jiraUrl}/rest/api/2/myself`,
            {
                auth: { username: user, password },
            },
        );
        if (!options.silent) {
            console.log(`-> Hallo ${data.displayName}. Ihre Zugangsdaten sind korrekt.`);
        }
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
    const pwd =
        defaults.password ??
        (await password({
            message: `Passwort für den Benutzer ${user || defaults.user}`,
        }));
    const credentials = { user, password: pwd };

    // re-try if credentials are wrong
    if (!(await checkCredentials(credentials))) {
        console.log("Der angegebene Benutzername / Passwort ist falsch. Bitte erneut versuchen.");
        return await getAuthorization(defaults);
    }

    return credentials;
};

/**
 * Non-interactive auth: Bearer token from env/UI, or user + password (validated against Jira).
 */
async function resolveAuthorization(
    defaults: AuthDefaults & { user?: string; password?: string },
): Promise<Authorization> {
    if (defaults.token) {
        return `Bearer ${defaults.token}`;
    }
    const user = defaults.user;
    const password = defaults.password ?? process.env["JIRA_PASS"];
    if (!user || !password) {
        throw new Error("Jira user and password are required when JIRA_TOKEN is not set.");
    }
    const credentials = { user, password };
    if (!(await checkCredentials(credentials, { silent: true }))) {
        throw new Error("Invalid username or password.");
    }
    return credentials;
}

export { getAuthorization, resolveAuthorization, checkCredentials };
