import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import weekday from "dayjs/plugin/weekday.js";
import localizedFormat from "dayjs/plugin/localizedFormat.js";
import "dayjs/locale/de.js";
import config from "../config.json" with { type: "json" };

dayjs.extend(weekday);
dayjs.extend(localizedFormat);
dayjs.locale("de");

export type BookingDateOption = {
    date: Dayjs;
    text: string;
    iso: string;
};

/**
 * Same day list as CLI date picker: last `maxLastDays` days with German labels.
 */
export function getBookingDateOptions(): BookingDateOption[] {
    const createDayIndices = (count: number) => [...Array(count).keys()];
    const dateToObject = (date: Dayjs) => ({
        date,
        text: date.format("dddd[,] LL"),
        iso: date.format("YYYY-MM-DD"),
    });
    const dayIndexToDateObjMapper = (i: number) => dateToObject(dayjs().subtract(i, "day"));

    return createDayIndices(config.maxLastDays || 10).map(dayIndexToDateObjMapper);
}

/**
 * Default index for "last workday" (Sunday -> 3 days back, else 1).
 */
export function getDefaultBookingDateIndex(): number {
    return dayjs().weekday() === 0 ? 3 : 1;
}
