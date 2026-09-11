import type { MorningBriefingPlan, Schedule, Weather } from "../domain/morningBriefing.js";
import type { TrainOperationStatus } from "../domain/trainOperation.js";

export type Today = {
  date: string;
  timeZone: string;
};

export interface ScheduleProvider {
  getSchedules(today: Today): Promise<Schedule[]>;
}

export interface WeatherProvider {
  getWeather(today: Today): Promise<Weather>;
}

export interface HolidayProvider {
  isHoliday(today: Today): Promise<boolean>;
}

export interface TrainStatusProvider {
  getStatuses(today: Today): Promise<TrainOperationStatus[]>;
}

export interface BriefingNarrator {
  narrate(plan: MorningBriefingPlan): Promise<string>;
}

export interface Speaker {
  speak(text: string): Promise<void>;
}
