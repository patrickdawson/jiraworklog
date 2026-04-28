export type TogglImportPreview = {
    valid: { issueKey: string; durationMin: number; description: string }[];
    invalid: { issueKey: string; durationMin: number; description: string }[];
    totalMinutes: number;
};

export type TogglPreviewResponse =
    | { ok: true; preview: TogglImportPreview }
    | { ok: false; error: string };
