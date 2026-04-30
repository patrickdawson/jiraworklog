export type DurationParts = {
    hours: number;
    remainingMinutes: number;
};

export function splitDurationMinutes(minutes: number): DurationParts {
    return {
        hours: Math.floor(minutes / 60),
        remainingMinutes: minutes % 60,
    };
}

export function formatDurationHoursMinutes(minutes: number): string {
    const { hours, remainingMinutes } = splitDurationMinutes(minutes);
    if (hours <= 0) {
        return `${remainingMinutes}m`;
    }
    return `${hours}h ${remainingMinutes}m`;
}
