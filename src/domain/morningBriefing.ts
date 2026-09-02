export type WeatherCondition = "clear" | "cloudy" | "rain" | "snow" | "other";

export type Weather = {
  condition: WeatherCondition;
  currentCelsius: number;
  lowCelsius: number;
  highCelsius: number;
  rainProbability: number;
  apparentLowCelsius?: number;
  apparentHighCelsius?: number;
  maxUvIndex?: number;
  maxWindSpeedKmh?: number;
};

export type Schedule = {
  title: string;
  description?: string;
  location?: string;
  startTime?: string;
  isAllDay: boolean;
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
    condition: string;
    currentCelsius: number;
    lowCelsius: number;
    highCelsius: number;
    umbrellaAdvice?: string;
    seasonalAdvice?: string[];
  };
  agenda?: {
    items: Schedule[];
  };
  weekdayFocus?: {
    period: "this-week" | "weekend-and-monday";
    date: string;
    item: Schedule;
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
  locationName?: string;
  weather: Weather;
  schedules: Schedule[];
  isLikelyGoingOut?: boolean;
  isHoliday?: boolean;
  upcomingScheduleDays?: UpcomingScheduleDay[];
}): MorningBriefingPlan {
  const schedulesToMention = input.schedules;
  const shouldBringUmbrella = input.isLikelyGoingOut !== false && (
    input.weather.condition === "rain" || input.weather.rainProbability >= 40
  );
  const seasonalAdvice = input.isLikelyGoingOut !== false ? seasonalAdviceFor(input.weather) : [];
  const weekdayFocus = input.isHoliday
    ? undefined
    : selectWeekdayFocus(input.date, input.upcomingScheduleDays ?? []);

  return {
    date: input.date,
    locationName: input.locationName,
    closing: closingFor({
      date: input.date,
      hasWeatherAdvice: shouldBringUmbrella || seasonalAdvice.length > 0,
      hasSchedules: input.schedules.length > 0,
    }),
    weather: {
      condition: conditionLabels[input.weather.condition],
      currentCelsius: Math.round(input.weather.currentCelsius),
      lowCelsius: Math.round(input.weather.lowCelsius),
      highCelsius: Math.round(input.weather.highCelsius),
      umbrellaAdvice: shouldBringUmbrella
        ? "雨の可能性があるため、傘があると安心です。"
        : undefined,
      seasonalAdvice: seasonalAdvice.length > 0 ? seasonalAdvice : undefined,
    },
    agenda:
      schedulesToMention.length > 0
        ? {
            items: schedulesToMention,
          }
        : undefined,
    weekdayFocus,
    targetDurationSeconds: targetDurationSeconds({
      scheduleCount: input.schedules.length,
      hasUmbrellaAdvice: shouldBringUmbrella,
      hasSeasonalAdvice: seasonalAdvice.length > 0,
      hasWeekdayFocus: Boolean(weekdayFocus),
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
  upcomingScheduleDays: UpcomingScheduleDay[],
): MorningBriefingPlan["weekdayFocus"] {
  const period = weekday(date) === 1
    ? "this-week"
    : weekday(date) === 5
      ? "weekend-and-monday"
      : undefined;
  if (!period) return undefined;

  for (const day of upcomingScheduleDays) {
    const item = day.schedules[0];
    if (item) return { period, date: day.date, item };
  }
  return undefined;
}

function targetDurationSeconds(input: {
  scheduleCount: number;
  hasUmbrellaAdvice: boolean;
  hasSeasonalAdvice: boolean;
  hasWeekdayFocus: boolean;
}): number {
  if (
    input.scheduleCount === 0 &&
    !input.hasUmbrellaAdvice &&
    !input.hasSeasonalAdvice &&
    !input.hasWeekdayFocus
  ) return 20;
  if (input.scheduleCount >= 4) return 70;
  if (input.scheduleCount >= 2) return 45;
  if (input.hasUmbrellaAdvice || input.hasSeasonalAdvice || input.hasWeekdayFocus) return 35;
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
