import type { HourlyPrecipitation, WeatherCondition } from "./morningBriefing.js";

export type HourlyWeatherCondition = { time: string; condition: WeatherCondition };
export type WeatherOutlook = { period: "午前" | "午後" | "夜"; conditions: WeatherCondition[] };

export function timeMinutes(time: string): number | undefined {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return undefined;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function remainingPrecipitation(periods: readonly HourlyPrecipitation[], fromTime: string): HourlyPrecipitation[] {
  const from = timeMinutes(fromTime);
  if (from === undefined) return [];
  return periods.filter(period => {
    const start = timeMinutes(period.startTime);
    const end = period.endTime === "24:00" ? 1440 : timeMinutes(period.endTime);
    return start !== undefined && end !== undefined && end - start === 60 && end > from &&
      Number.isFinite(period.precipitationProbability) && period.precipitationProbability >= 0 && period.precipitationProbability <= 100;
  });
}

export function remainingConditions(hourly: readonly HourlyWeatherCondition[], fromTime: string): HourlyWeatherCondition[] {
  const from = timeMinutes(fromTime);
  if (from === undefined) return [];
  // weather_codeはその時刻の瞬時値。雨量のように直前1時間へずらさない。
  return hourly.filter(item => {
    const at = timeMinutes(item.time);
    return at !== undefined && at >= from && at % 60 === 0;
  }).sort((a, b) => timeMinutes(a.time)! - timeMinutes(b.time)!);
}

export function weatherOutlook(hourly: readonly HourlyWeatherCondition[], current: WeatherCondition): WeatherOutlook[] {
  const result: WeatherOutlook[] = [];
  for (const [period, start, end] of [["午前", 0, 12], ["午後", 12, 18], ["夜", 18, 24]] as const) {
    const conditions = [...new Set(hourly.filter(item => {
      const at = timeMinutes(item.time);
      return at !== undefined && start * 60 <= at && at < end * 60;
    }).map(item => item.condition))];
    if (conditions.some(condition => condition !== current)) result.push({ period, conditions });
  }
  return result;
}
