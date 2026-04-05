import _ from "lodash";
import Conf from "conf";
import fuzzy from "fuzzy";
import config from "../config.json" with { type: "json" };
import type { ConfSchema } from "./types.js";

const configstore = new Conf<ConfSchema>();

export const expandIssue = (value: string): string =>
    /^[0-9].*/.test(value) ? `TXR-${value}` : value;

export function getLastIssues(): string[] {
    return configstore.get("lastIssues") ?? [];
}

export function getAllIssues(getKeys?: boolean): string[] {
    return [
        ...getLastIssues(),
        ..._.map(config.issues, (i) => (getKeys ? i.value : i.name)),
    ];
}

export function getIssueKeyByName(name: string): string {
    const issue = _.find(config.issues, ["name", name]);
    if (!_.isNil(issue)) {
        return issue.value;
    }
    throw new Error(`Issue with name '${name}' not found!`);
}

export type IssueChoice = { name: string; value: string };

export function filterIssueChoices(term: string | void): IssueChoice[] {
    const inputStr = term ?? "";
    const lastIssueChoices: IssueChoice[] = getLastIssues().map((k) => ({ name: k, value: k }));
    const configIssueChoices: IssueChoice[] = config.issues.map((i) => ({
        name: i.name,
        value: i.value,
    }));
    const allChoices = [...lastIssueChoices, ...configIssueChoices];

    const fuzzyResult = fuzzy.filter(
        inputStr,
        allChoices.map((c) => c.name),
    );
    const filteredNames = new Set(fuzzyResult.map((r) => r.original));
    const filtered = allChoices.filter((c) => filteredNames.has(c.name));

    if (inputStr && !filtered.some((c) => c.value === expandIssue(inputStr))) {
        return [...filtered, { name: inputStr, value: expandIssue(inputStr) }];
    }
    return filtered;
}

export function addToLastIssues(issue: string): void {
    const lastIssues = getLastIssues();
    const idx = lastIssues.findIndex((v) => v === issue);
    if (idx >= 0) {
        lastIssues.splice(idx, 1);
    }
    lastIssues.unshift(issue);
    if (lastIssues.length > config.maxLastIssues) {
        lastIssues.splice(config.maxLastIssues);
    }
    configstore.set(
        "lastIssues",
        lastIssues.filter((v) => !!v),
    );
}

export function setStoredUser(user: string): void {
    configstore.set("user", user);
}

export function getStoredUser(): string | undefined {
    return configstore.get("user");
}
