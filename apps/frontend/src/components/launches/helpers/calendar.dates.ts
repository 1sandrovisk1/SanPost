import dayjs, { ConfigType } from 'dayjs';
import { fromUtc, newDayjs } from '@gitroom/helpers/utils/user.timezone';

export const calendarMonthStart = (day: ConfigType) =>
  newDayjs(day).startOf('month');

// Channel slots are stored as UTC minutes. Choose the UTC day whose instant
// falls on the selected local date; keep both instants of a repeated DST hour.
export const calendarSlotDate = (localDate: string, minutes: number) => {
  const anchor = dayjs.utc(localDate).startOf('day').add(minutes, 'minutes');
  const candidates = [
    anchor,
    anchor.subtract(1, 'day'),
    anchor.add(1, 'day'),
  ].map((value) => fromUtc(value));
  return (
    candidates.find((value) => value.format('YYYY-MM-DD') === localDate) ||
    null
  );
};
