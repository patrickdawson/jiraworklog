"use strict";

import got from "got";
import inquirer from "inquirer";
import { jiraUrl } from "../config.json";
import type { AuthDefaults, AuthorizationResult, Credentials } from "./types";

async function checkCredentials({ user, password }: Credentials): Promise<boolean> {
    try {
        const { body } = await got.get<{ displayName: string }>(
            `${jiraUrl}/rest/api/2/myself`,
            {
                responseType: "json",
                username: user,
                password,
            },
        );
        console.log(`-> Hello ${body.displayName}. Your credentials are correct.`);
        return true;
    } catch (err: unknown) {
        const e = err as { status?: number };
        if (e.status === 401) {
            return false;
        } else if (e.status === 403) {
            throw new Error(
                "Jira rejected your account. Use your browser to login and solve any captcha requests.",
                { cause: err },
            );
        }
        throw err;
    }
}

/**
 * Resolves with user and password configuration
 * @param defaults - The default user and password
 * @returns Resolves with user and password
 */
export const getAuthorization = async (defaults: AuthDefaults = {}): Promise<AuthorizationResult> => {
    if (defaults.token) {
        return `Bearer ${defaults.token}`;
    }

    const answers = await inquirer.prompt<{ user: string; password?: string }>([
        {
            type: "input",
            name: "user",
            message: "Für welchen Benutzer möchtest du buchen",
            default: () => defaults.user,
        },
        {
            type: "password",
            name: "password",
            message: (answers: { user?: string }) =>
                `Passwort für den Benutzer ${answers.user || defaults.user}`,
            when: () => !defaults.password,
        },
    ]);

    const credentials: Credentials = {
        user: answers.user as string,
        password: (defaults.password || answers.password) as string,
    };

    if (!(await checkCredentials(credentials))) {
        console.log("Given username / password was incorrect. Try again.");
        return await getAuthorization(defaults);
    }

    return credentials;
};
