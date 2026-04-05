export type TogglImportPreview = {
    valid: { issueKey: string; durationMin: number; description: string }[];
    invalid: { issueKey: string; durationMin: number; description: string }[];
    totalMinutes: number;
};
