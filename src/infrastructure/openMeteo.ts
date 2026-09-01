import type { Weather, WeatherCondition } from "../domain/morningBriefing.js";
import type { Today, WeatherProvider } from "../application/ports.js";

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
  daily?: {
    temperature_2m_min?: number[];
    temperature_2m_max?: number[];
    precipitation_probability_max?: number[];
    weather_code?: number[];
  };
};

export class OpenMeteoWeatherProvider implements WeatherProvider {
  constructor(
    private readonly location: { latitude: number; longitude: number },
  ) {}

  async getWeather(today: Today): Promise<Weather> {
    const params = new URLSearchParams({
      latitude: String(this.location.latitude),
      longitude: String(this.location.longitude),
      timezone: today.timeZone,
      start_date: today.date,
      end_date: today.date,
      current: "temperature_2m,weather_code",
      daily:
        "weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max",
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`天気の取得に失敗しました (${response.status})。`);
    }

    const data = (await response.json()) as OpenMeteoResponse;
    const currentTemperature = data.current?.temperature_2m;
    const low = data.daily?.temperature_2m_min?.[0];
    const high = data.daily?.temperature_2m_max?.[0];
    const rainProbability = data.daily?.precipitation_probability_max?.[0];
    const weatherCode = data.current?.weather_code ?? data.daily?.weather_code?.[0];

    if (
      currentTemperature === undefined ||
      low === undefined ||
      high === undefined ||
      rainProbability === undefined ||
      weatherCode === undefined
    ) {
      throw new Error("天気APIの応答に必要な情報がありません。");
    }

    return {
      condition: weatherConditionFromCode(weatherCode),
      currentCelsius: currentTemperature,
      lowCelsius: low,
      highCelsius: high,
      rainProbability,
    };
  }
}

function weatherConditionFromCode(code: number): WeatherCondition {
  if (code === 0 || code === 1) return "clear";
  if ([2, 3, 45, 48].includes(code)) return "cloudy";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) {
    return "rain";
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  return "other";
}
