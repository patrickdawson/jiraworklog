export type TogglImportPreview = {
    valid: {
        issueKey: string;
        durationMin: number;
        description: string;
        durationFormatted: string;
    }[];
    invalid: {
        issueKey: string;
        durationMin: number;
        description: string;
        durationFormatted: string;
    }[];
    totalMinutes: number;
    totalFormatted: string;
};

export type TogglPreviewResponse =
    | { ok: true; preview: TogglImportPreview }
    | { ok: false; error: string };
