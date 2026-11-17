import type { CommuteIssue } from "./trainOperation.js";
import { selectWeatherScheduleContext, type WeatherScheduleContext } from "./weatherScheduleContext.js";
import { temperatureChanges, type TemperatureComparison, type TemperatureChanges } from "./temperatureChanges.js";
import type { PollenForecast } from "./pollen.js";
import type { YellowDustNotice } from "./yellowDust.js";
import { remainingConditions, remainingPrecipitation, weatherOutlook, type HourlyWeatherCondition } from "./remainingWeather.js";

export type WeatherCondition = "clear" | "cloudy" | "rain" | "snow" | "other";

// 設定地点の、当日の現地時刻で表した1時間の降水予報。終端だけ24:00を許可する。
export type HourlyPrecipitation = {
  startTime: string;
  endTime: string;
  precipitationProbability: number;
  rainMillimeters: number;
};

export type Weather = TemperatureComparison & {
  condition: WeatherCondition;
  currentCelsius: number;
  lowCelsius: number;
  highCelsius: number;
  rainProbability: number;
  apparentLowCelsius?: number;
  apparentHighCelsius?: number;
  maxUvIndex?: number;
  maxWindSpeedKmh?: number;
  hourlyPrecipitation?: HourlyPrecipitation[];
  hourlyConditions?: HourlyWeatherCondition[];
};

export type RegionalWeatherForecast = {
  areaName: string;
  summary: string;
  hasUpcomingRainRisk: boolean;
};

export type Schedule = {
  title: string;
  description?: string;
  location?: string;
  startTime?: string;
  isAllDay: boolean;
  requiresGoingOut?: boolean;
  briefingHints?: string[];
};

export type UpcomingScheduleDay = {
  date: string;
  schedules: Schedule[];
};

export type MorningBriefingPlan = {
  date: string;
  locationName?: string;
  closing: {
    kind: "weather-advice" | "schedule-context" | "neutral";
    style?: "brief" | "gentle" | "plain";
  };
  weather: {
    currentCondition?: string;
    outlook?: { period: "午前" | "午後" | "夜"; conditions: string[] }[];
    currentCelsius?: number;
    lowCelsius?: number;
    highCelsius?: number;
    regionalForecast?: Pick<RegionalWeatherForecast, "areaName" | "summary">;
    forecastUnavailable?: true;
    umbrellaAdvice?: string;
    seasonalAdvice?: string[];
    scheduleContext?: WeatherScheduleContext;
    temperatureChanges?: TemperatureChanges;
    pollen?: PollenForecast;
    pollenSeasonStart?: { announcement: string }[];
    yellowDust?: YellowDustNotice;
  };
  agenda?: {
    items: Schedule[];
  };
  news?: { announcement: string };
  weekdayFocus?: {
    period: "this-week" | "weekend-and-monday";
    date: string;
    item: Schedule;
  };
  commute?: {
    issues: CommuteIssue[];
    guidance: string;
  };
  targetDurationSeconds: number;
};

const conditionLabels: Record<WeatherCondition, string> = {
  clear: "晴れ",
  cloudy: "くもり",
  rain: "雨",
  snow: "雪",
  other: "変わりやすい空模様",
};

export function planMorningBriefing(input: {
  date: string;
  fromTime?: string;
  locationName?: string;
  weather?: Weather;
  regionalForecast?: RegionalWeatherForecast;
  schedules: Schedule[];
  isLikelyGoingOut?: boolean;
  isHoliday?: boolean;
  upcomingScheduleDays?: UpcomingScheduleDay[];
  commuteIssues?: CommuteIssue[];
  pollen?: PollenForecast;
  yellowDust?: YellowDustNotice;
}): MorningBriefingPlan {
  const schedulesToMention = input.schedules;
  const fromTime = input.fromTime ?? "00:00";
  const { weather, regionalForecast } = input;
  const precipitation = remainingPrecipitation(weather?.hourlyPrecipitation ?? [], fromTime);
  const conditions = remainingConditions(weather?.hourlyConditions ?? [], fromTime);
  const outlook = weather ? weatherOutlook(conditions, weather.condition) : [];
  const scheduleContext = input.isLikelyGoingOut === false
    ? undefined
    : selectWeatherScheduleContext(schedulesToMention, precipitation, fromTime);
  const shouldBringUmbrella = input.isLikelyGoingOut !== false && (
    weather?.condition === "rain" || conditions.some(item => item.condition === "rain") ||
    precipitation.some(period => period.precipitationProbability >= 40) || Boolean(scheduleContext) ||
    regionalForecast?.hasUpcomingRainRisk === true
  );
  const seasonalAdvice = weather && input.isLikelyGoingOut !== false ? seasonalAdviceFor(weather) : [];
  const changes = weather ? temperatureChanges(weather.highCelsius, weather) : undefined;
  const pollen = input.pollen?.date === input.date && input.pollen.types.length ? input.pollen : undefined;
  const yellowDust = input.yellowDust?.date === input.date ? input.yellowDust : undefined;
  const weekdayFocus = input.isHoliday
    ? undefined
    : selectWeekdayFocus(input.date, schedulesToMention, input.upcomingScheduleDays ?? []);

  return {
    date: input.date,
    locationName: input.locationName,
    closing: closingFor({
      date: input.date,
      hasWeatherAdvice: shouldBringUmbrella || seasonalAdvice.length > 0 || Boolean(changes) || Boolean(pollen) || Boolean(yellowDust),
      hasSchedules: input.schedules.length > 0,
    }),
    weather: {
      ...(weather ? {
        currentCondition: conditionLabels[weather.condition],
        currentCelsius: Math.round(weather.currentCelsius),
        lowCelsius: Math.round(weather.lowCelsius),
        highCelsius: Math.round(weather.highCelsius),
      } : regionalForecast ? {
        regionalForecast: { areaName: regionalForecast.areaName, summary: regionalForecast.summary },
      } : { forecastUnavailable: true as const }),
      ...(outlook.length ? { outlook: outlook.map(item => ({ period: item.period, conditions: item.conditions.map(condition => conditionLabels[condition]) })) } : {}),
      // 予定に結び付けて傘を案内する場合は、一般的な傘の一文を重ねない。
      umbrellaAdvice: shouldBringUmbrella && !scheduleContext
        ? "雨の可能性があるため、傘があると安心です。"
        : undefined,
      seasonalAdvice: seasonalAdvice.length > 0 ? seasonalAdvice : undefined,
      ...(scheduleContext ? { scheduleContext } : {}),
      ...(changes ? { temperatureChanges: changes } : {}),
      ...(pollen ? { pollen } : {}),
      ...(yellowDust ? { yellowDust } : {}),
    },
    agenda:
      schedulesToMention.length > 0
        ? {
            items: schedulesToMention,
          }
        : undefined,
    weekdayFocus,
    commute: input.commuteIssues && input.commuteIssues.length > 0
      ? {
          issues: input.commuteIssues,
          guidance: "公式アプリや駅の案内もあわせて確認するための補助情報です。",
        }
      : undefined,
    targetDurationSeconds: targetDurationSeconds({
      scheduleCount: input.schedules.length,
      hasUmbrellaAdvice: shouldBringUmbrella,
      hasSeasonalAdvice: seasonalAdvice.length > 0 || Boolean(changes) || Boolean(pollen) || Boolean(yellowDust),
      hasWeekdayFocus: Boolean(weekdayFocus),
      hasCommuteIssue: Boolean(input.commuteIssues?.length),
    }),
  };
}

export function upcomingBriefingDates(date: string, isHoliday = false): string[] {
  if (isHoliday) return [];

  const dayOfWeek = weekday(date);
  if (dayOfWeek === 1) return [1, 2, 3, 4, 5, 6].map((days) => addDays(date, days));
  if (dayOfWeek === 5) return [1, 2, 3].map((days) => addDays(date, days));
  return [];
}

function selectWeekdayFocus(
  date: string,
  schedules: Schedule[],
  upcomingScheduleDays: UpcomingScheduleDay[],
): MorningBriefingPlan["weekdayFocus"] {
  const period = weekday(date) === 1
    ? "this-week"
    : weekday(date) === 5
      ? "weekend-and-monday"
      : undefined;
  if (!period) return undefined;

  const scheduleDays = period === "this-week"
    ? [{ date, schedules }, ...upcomingScheduleDays]
    : upcomingScheduleDays;

  for (const day of scheduleDays) {
    const item = firstScheduleOfDay(day.schedules);
    if (item) return { period, date: day.date, item };
  }
  return undefined;
}

function firstScheduleOfDay(schedules: Schedule[]): Schedule | undefined {
  return schedules.reduce<Schedule | undefined>((first, schedule) => {
    if (!first) return schedule;
    return scheduleOrder(schedule) < scheduleOrder(first) ? schedule : first;
  }, undefined);
}

function scheduleOrder(schedule: Schedule): number {
  if (schedule.isAllDay) return -1;
  if (!schedule.startTime) return Number.POSITIVE_INFINITY;

  const [hours, minutes] = schedule.startTime.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return Number.POSITIVE_INFINITY;
  return hours * 60 + minutes;
}

function targetDurationSeconds(input: {
  scheduleCount: number;
  hasUmbrellaAdvice: boolean;
  hasSeasonalAdvice: boolean;
  hasWeekdayFocus: boolean;
  hasCommuteIssue: boolean;
}): number {
  if (
    input.scheduleCount === 0 &&
    !input.hasUmbrellaAdvice &&
    !input.hasSeasonalAdvice &&
    !input.hasWeekdayFocus &&
    !input.hasCommuteIssue
  ) return 20;
  if (input.scheduleCount >= 4) return 70;
  if (input.scheduleCount >= 2) return 45;
  if (input.hasUmbrellaAdvice || input.hasSeasonalAdvice || input.hasWeekdayFocus || input.hasCommuteIssue) return 35;
  return 30;
}

function seasonalAdviceFor(weather: Weather): string[] {
  const advice: string[] = [];

  if (weather.apparentHighCelsius !== undefined && weather.apparentHighCelsius >= 32) {
    advice.push("日中は体感的にも暑くなりそうです。");
  } else if (weather.apparentLowCelsius !== undefined && weather.apparentLowCelsius <= 5) {
    advice.push("朝晩は体感的に冷えそうです。");
  }

  if (weather.maxUvIndex !== undefined && weather.maxUvIndex >= 6) {
    advice.push("日差しが強そうです。");
  }

  if (weather.maxWindSpeedKmh !== undefined && weather.maxWindSpeedKmh >= 30) {
    advice.push("風が強まりそうです。");
  }

  return advice.slice(0, 2);
}

function closingFor(input: {
  date: string;
  hasWeatherAdvice: boolean;
  hasSchedules: boolean;
}): MorningBriefingPlan["closing"] {
  if (input.hasWeatherAdvice) return { kind: "weather-advice" };
  if (input.hasSchedules) return { kind: "schedule-context" };

  return { kind: "neutral", style: neutralClosingStyleFor(input.date) };
}

function neutralClosingStyleFor(date: string): "brief" | "gentle" | "plain" {
  const dayOfMonth = Number(date.slice(-2));
  const styles = ["brief", "gentle", "plain"] as const;
  return styles[dayOfMonth % styles.length] ?? "plain";
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
