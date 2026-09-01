import type { MorningBriefingPlan, Schedule, Weather } from "../domain/morningBriefing.js";

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

export interface BriefingNarrator {
  narrate(plan: MorningBriefingPlan): Promise<string>;
}

export interface Speaker {
  speak(text: string): Promise<void>;
}
