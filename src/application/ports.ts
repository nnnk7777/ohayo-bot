import type { MorningBriefingPlan, RegionalWeatherForecast, Schedule, Weather } from "../domain/morningBriefing.js";
import type { TrainOperationStatus } from "../domain/trainOperation.js";
import type { NewsItem, IntroducedNews } from "../domain/morningNews.js";
import type { PollenForecast } from "../domain/pollen.js";
import type { YellowDustNotice } from "../domain/yellowDust.js";
import type { PollenSeasonNotice } from "../domain/pollenSeason.js";

export type Today = {
  date: string;
  timeZone: string;
  // ブリーフィングを作る地点の現地時刻。過去シナリオなど未指定時は00:00として扱う。
  time?: string;
};

export interface ScheduleProvider {
  getSchedules(today: Today): Promise<Schedule[]>;
}

export interface WeatherProvider {
  getWeather(today: Today): Promise<Weather>;
}

export interface RegionalWeatherProvider {
  getForecast(today: Today): Promise<RegionalWeatherForecast>;
}

export interface PollenProvider {
  getForecast(today: Today): Promise<PollenForecast | undefined>;
}

export interface PollenSeasonProvider {
  getNotices(today: Today, introduced: readonly string[]): Promise<PollenSeasonNotice[]>;
}

export interface PollenSeasonHistory {
  read(): Promise<string[]>;
  record(keys: readonly string[]): Promise<void>;
}

export interface YellowDustProvider {
  getNotice(today: Today): Promise<YellowDustNotice | undefined>;
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

export interface NewsProvider {
  getNews(today: Today, introduced?: readonly IntroducedNews[]): Promise<NewsItem | undefined>;
}

export interface NewsHistory {
  read(): Promise<IntroducedNews[]>;
  record(item: IntroducedNews): Promise<void>;
}

export interface NewsMailer {
  sendNews(item: NewsItem): Promise<void>;
}
