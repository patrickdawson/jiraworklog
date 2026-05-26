import axios from "axios";
import { input, password } from "@inquirer/prompts";
import config from "../config.json" with { type: "json" };
import { getJiraAxiosConfig } from "./jira-http.js";
import type { Authorization, AuthDefaults } from "./types.js";

type CheckCredentialsOptions = { silent?: boolean };

async function checkCredentials(
    credentials: Authorization,
    options: CheckCredentialsOptions = {},
): Promise<boolean> {
    try {
        const { data } = await axios.get<{ displayName: string }>(
            `${config.jiraUrl}/rest/api/2/myself`,
            getJiraAxiosConfig(credentials),
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
                    "Jira hat den Zugriff abgelehnt. Bitte im Browser anmelden und ggf. Captcha bestätigen.",
                    { cause: err },
                );
            }
        }
        throw err;
    }
}

function resolveAccountEmail(defaults: AuthDefaults): string | undefined {
    return defaults.user?.trim() || process.env["JIRA_USER"]?.trim();
}

async function resolveTokenAuthorization(defaults: AuthDefaults): Promise<Authorization> {
    const token = defaults.token!.trim();
    let email = resolveAccountEmail(defaults);
    if (!email) {
        email = await input({
            message: "Atlassian-Konto (E-Mail-Adresse)",
            validate: (value) => (value.includes("@") ? true : "Bitte E-Mail-Adresse eingeben"),
        });
    }
    const credentials: Authorization = { user: email, password: token };
    if (!(await checkCredentials(credentials))) {
        console.log("Der angegebene API-Token oder die E-Mail ist falsch. Bitte erneut versuchen.");
        return await getAuthorization({ user: email, skipEnvCredentials: true });
    }
    return credentials;
}

/**
 * Resolves with user and password (API token on Jira Cloud).
 */
const getAuthorization = async (defaults: AuthDefaults = {}): Promise<Authorization> => {
    if (defaults.token) {
        return await resolveTokenAuthorization(defaults);
    }

    const user = await input({
        message: "Für welchen Benutzer möchtest du buchen (Atlassian E-Mail)",
        default: defaults.user,
    });
    const pwd = defaults.skipEnvCredentials
        ? await password({ message: `API-Token für ${user}` })
        : (defaults.password ??
          process.env["JIRA_TOKEN"]?.trim() ??
          (await password({
              message: `API-Token für ${user || defaults.user}`,
          })));
    const credentials: Authorization = { user, password: pwd };

    if (!(await checkCredentials(credentials))) {
        console.log("Der angegebene Benutzername / Passwort ist falsch. Bitte erneut versuchen.");
        return await getAuthorization({ user, skipEnvCredentials: true });
    }

    return credentials;
};

/**
 * Non-interactive auth: API token + email, or email + API token as password.
 */
async function resolveAuthorization(
    defaults: AuthDefaults & { user?: string; password?: string },
): Promise<Authorization> {
    if (defaults.token) {
        const email = resolveAccountEmail(defaults);
        if (!email) {
            throw new Error("Mit JIRA_TOKEN ist JIRA_USER erforderlich.");
        }
        const credentials: Authorization = { user: email, password: defaults.token.trim() };
        if (!(await checkCredentials(credentials, { silent: true }))) {
            throw new Error("Invalid email or API token.");
        }
        return credentials;
    }
    const user = defaults.user;
    const pwd = defaults.password ?? process.env["JIRA_TOKEN"]?.trim();
    if (!user || !pwd) {
        throw new Error("JIRA_USER und JIRA_TOKEN sind erforderlich.");
    }
    const credentials: Authorization = { user, password: pwd };
    if (!(await checkCredentials(credentials, { silent: true }))) {
        throw new Error("Invalid email or API token.");
    }
    return credentials;
}

export { getAuthorization, resolveAuthorization, checkCredentials };
