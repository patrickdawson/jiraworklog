import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../lib/types.js";

const config = vi.hoisted(
    () =>
        ({
            jiraUrl: "",
            issues: [] as { name: string; value: string }[],
            maxLastIssues: 10,
            maxLastDays: 30,
            jiraProjectKeys: [] as string[],
            togglUrl: "",
            togglWorkspace: "",
        }) as AppConfig,
);

vi.mock("../config.json", () => ({ default: config }));

vi.mock("conf", () => ({
    default: class {
        get = vi.fn();
        set = vi.fn();
    },
}));

import { expandIssue, filterIssueChoices } from "../lib/issues.js";

describe("expandIssue", () => {
    it("prefixes bare numeric input with TXR-", () => {
        expect(expandIssue("12345")).toBe("TXR-12345");
    });

    it("does not change keys that do not start with a digit", () => {
        expect(expandIssue("TXR-99")).toBe("TXR-99");
        expect(expandIssue("foo")).toBe("foo");
    });
});

describe("filterIssueChoices", () => {
    beforeEach(() => {
        config.issues = [
            { name: "Daily", value: "TXPIV-59" },
            { name: "Sonstiges", value: "TXPIV-46" },
        ];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("returns config issues when search term is empty", () => {
        const choices = filterIssueChoices("");
        expect(choices.map((c) => c.name)).toContain("Daily");
        expect(choices.map((c) => c.name)).toContain("Sonstiges");
    });

    it("filters by fuzzy match on name", () => {
        const choices = filterIssueChoices("Sonst");
        expect(choices.some((c) => c.name === "Sonstiges")).toBe(true);
    });

    it("appends custom key when typed input does not match", () => {
        const choices = filterIssueChoices("99999");
        expect(choices.some((c) => c.value === "TXR-99999")).toBe(true);
    });
});
