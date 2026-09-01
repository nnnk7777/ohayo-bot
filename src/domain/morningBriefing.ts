export type WeatherCondition = "clear" | "cloudy" | "rain" | "snow" | "other";

export type Weather = {
  condition: WeatherCondition;
  currentCelsius: number;
  lowCelsius: number;
  highCelsius: number;
  rainProbability: number;
};

export type Schedule = {
  title: string;
  description?: string;
  location?: string;
  startTime?: string;
  isAllDay: boolean;
};

export type MorningBriefingPlan = {
  date: string;
  weather: {
    condition: string;
    currentCelsius: number;
    lowCelsius: number;
    highCelsius: number;
    umbrellaAdvice?: string;
  };
  agenda?: {
    items: Schedule[];
    remainingCount: number;
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
  weather: Weather;
  schedules: Schedule[];
  isLikelyGoingOut?: boolean;
}): MorningBriefingPlan {
  const schedulesToMention = input.schedules.slice(0, 3);
  const shouldBringUmbrella = input.isLikelyGoingOut !== false && (
    input.weather.condition === "rain" || input.weather.rainProbability >= 40
  );

  return {
    date: input.date,
    weather: {
      condition: conditionLabels[input.weather.condition],
      currentCelsius: Math.round(input.weather.currentCelsius),
      lowCelsius: Math.round(input.weather.lowCelsius),
      highCelsius: Math.round(input.weather.highCelsius),
      umbrellaAdvice: shouldBringUmbrella
        ? "雨の可能性があるため、傘があると安心です。"
        : undefined,
    },
    agenda:
      schedulesToMention.length > 0
        ? {
            items: schedulesToMention,
            remainingCount: input.schedules.length - schedulesToMention.length,
          }
        : undefined,
    targetDurationSeconds: input.schedules.length > 0 ? 45 : 30,
  };
}
