import type { HourlyPrecipitation, Schedule } from "./morningBriefing.js";
import { hasOutsideSchedule } from "./personalProfile/dailyRoutine.js";

export type WeatherScheduleContext = {
  kind: "rain-near-schedule";
  schedule: { title: string; startTime: string };
  forecast: {
    startTime: string;
    endTime: string;
    precipitationProbability: number;
    rainMillimeters: number;
    intensity: "light" | "normal" | "stronger";
  };
};

// 移動時間や帰宅時刻は推定せず、開始時刻を含む予報がある外出予定を最大1件選ぶ。
export function selectWeatherScheduleContext(
  schedules: readonly Schedule[],
  hourly: readonly HourlyPrecipitation[],
): WeatherScheduleContext | undefined {
  const candidates = schedules
    .filter(schedule => !schedule.isAllDay && hasOutsideSchedule(schedule) && minutes(schedule.startTime) !== undefined)
    .sort((a, b) => minutes(a.startTime)! - minutes(b.startTime)!);

  for (const schedule of candidates) {
    const at = minutes(schedule.startTime)!;
    const forecast = hourly.find(period => {
      const start = minutes(period.startTime);
      const end = period.endTime === "24:00" ? 1440 : minutes(period.endTime);
      return start !== undefined && end !== undefined && end - start === 60 && start <= at && at < end &&
        Number.isFinite(period.rainMillimeters) && period.rainMillimeters >= 0.1 &&
        Number.isFinite(period.precipitationProbability) &&
        period.precipitationProbability >= 40 && period.precipitationProbability <= 100;
    });
    if (forecast) return {
      kind: "rain-near-schedule",
      schedule: { title: schedule.title, startTime: schedule.startTime! },
      forecast: {
        startTime: forecast.startTime,
        endTime: forecast.endTime,
        precipitationProbability: forecast.precipitationProbability,
        rainMillimeters: forecast.rainMillimeters,
        // 気象庁の弱い雨の境界3mm/hと、やや強い雨の下限10mm/hを目安にした案内の3段階。
        intensity: forecast.rainMillimeters < 3 ? "light" : forecast.rainMillimeters < 10 ? "normal" : "stronger",
      },
    };
  }
  return undefined;
}

function minutes(time: string | undefined): number | undefined {
  if (!time || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return undefined;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}
