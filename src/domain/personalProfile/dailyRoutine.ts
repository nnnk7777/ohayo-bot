import type { Schedule } from "../morningBriefing.js";

export const dailyRoutine = {
  officeWeekdays: [1, 3, 4],
  remoteWeekdays: [2, 5],
} as const;

export function isLikelyGoingOut(input: {
  date: string;
  isHoliday?: boolean;
  schedules: Schedule[];
}): boolean {
  if (input.schedules.some(hasOutsideSchedule)) return true;
  if (input.isHoliday) return false;
  return dailyRoutine.officeWeekdays.includes(weekday(input.date) as 1 | 3 | 4);
}

function hasOutsideSchedule(schedule: Schedule): boolean {
  const text = `${schedule.title}\n${schedule.description ?? ""}\n${schedule.location ?? ""}`.toLowerCase();
  if (/zoom|google meet|teams|オンライン|リモート/.test(text)) return false;
  return Boolean(schedule.location?.trim()) || /出社|外出|訪問|通院|病院|歯科/.test(text);
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}
