import type { Schedule } from "../morningBriefing.js";

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type DailyRoutine = {
  officeWeekdays: readonly Weekday[];
  remoteWeekdays: readonly Weekday[];
};

export function isLikelyGoingOut(input: {
  date: string;
  isHoliday?: boolean;
  schedules: Schedule[];
  dailyRoutine: DailyRoutine;
}): boolean {
  if (input.schedules.some(hasOutsideSchedule)) return true;
  if (input.schedules.some(isExplicitRemoteWork)) return false;
  if (input.isHoliday) return false;
  return input.dailyRoutine.officeWeekdays.includes(weekday(input.date));
}

function isExplicitRemoteWork(schedule: Schedule): boolean {
  const text = `${schedule.title}\n${schedule.description ?? ""}`.toLowerCase();
  return /在宅勤務|リモート勤務/.test(text);
}

function hasOutsideSchedule(schedule: Schedule): boolean {
  const text = `${schedule.title}\n${schedule.description ?? ""}\n${schedule.location ?? ""}`.toLowerCase();
  if (/zoom|google meet|teams|オンライン|リモート/.test(text)) return false;
  if (schedule.requiresGoingOut) return true;
  return Boolean(schedule.location?.trim()) || /出社|外出|訪問|通院|病院|歯科/.test(text);
}

function weekday(date: string): Weekday {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() || 7) as Weekday;
}
