import { describe, expect, it } from "vitest";
import { partitionTogglWorkEntries } from "../lib/toggl-import.js";

describe("partitionTogglWorkEntries", () => {
    it("moves undefined issue keys to invalid and sums valid minutes", () => {
        const result = partitionTogglWorkEntries([
            { issueKey: "TXR-1", durationMin: 30, description: "a" },
            { issueKey: "undefined", durationMin: 10, description: "b" },
            { issueKey: "TXPIV-2", durationMin: 5, description: "c" },
        ]);
        expect(result.valid).toEqual([
            { issueKey: "TXR-1", durationMin: 30, description: "a" },
            { issueKey: "TXPIV-2", durationMin: 5, description: "c" },
        ]);
        expect(result.invalid).toEqual([{ issueKey: "undefined", durationMin: 10, description: "b" }]);
        expect(result.totalMinutes).toBe(35);
    });

    it("returns empty invalid when all keys are valid", () => {
        const result = partitionTogglWorkEntries([
            { issueKey: "TXR-1", durationMin: 60, description: "x" },
        ]);
        expect(result.invalid).toHaveLength(0);
        expect(result.totalMinutes).toBe(60);
    });

    it("handles empty input", () => {
        const result = partitionTogglWorkEntries([]);
        expect(result.valid).toEqual([]);
        expect(result.invalid).toEqual([]);
        expect(result.totalMinutes).toBe(0);
    });
});
