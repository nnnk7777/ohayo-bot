import { DateTime } from "luxon";
import type { HourlyPrecipitation, Weather, WeatherCondition } from "../domain/morningBriefing.js";
import type { Today, WeatherProvider } from "../application/ports.js";

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
  daily?: {
    apparent_temperature_min?: number[];
    apparent_temperature_max?: number[];
    temperature_2m_min?: number[];
    temperature_2m_max?: number[];
    precipitation_probability_max?: number[];
    uv_index_max?: number[];
    wind_speed_10m_max?: number[];
    weather_code?: number[];
  };
  hourly?: {
    time?: string[];
    precipitation_probability?: (number | null)[];
    rain?: (number | null)[];
    showers?: (number | null)[];
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
      // 降水量・降水確率は時刻ラベルの「直前1時間」。翌日00:00まで取得して23時台も含める。
      start_hour: `${today.date}T01:00`,
      end_hour: `${DateTime.fromISO(today.date, { zone: today.timeZone }).plus({ days: 1 }).toISODate()}T00:00`,
      hourly: "precipitation_probability,rain,showers",
      current: "temperature_2m,weather_code",
      daily:
        "weather_code,temperature_2m_min,temperature_2m_max,apparent_temperature_min,apparent_temperature_max,precipitation_probability_max,uv_index_max,wind_speed_10m_max",
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
    const hourlyPrecipitation = precipitationPeriods(data.hourly, today);

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
      apparentLowCelsius: data.daily?.apparent_temperature_min?.[0],
      apparentHighCelsius: data.daily?.apparent_temperature_max?.[0],
      maxUvIndex: data.daily?.uv_index_max?.[0],
      maxWindSpeedKmh: data.daily?.wind_speed_10m_max?.[0],
      ...(hourlyPrecipitation.length ? { hourlyPrecipitation } : {}),
    };
  }
}

function precipitationPeriods(hourly: OpenMeteoResponse["hourly"], today: Today): HourlyPrecipitation[] {
  if (!Array.isArray(hourly?.time)) return [];
  return hourly.time.flatMap((time, i) => {
    if (typeof time !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(time)) return [];
    const end = DateTime.fromISO(time, { zone: today.timeZone });
    const start = end.minus({ hours: 1 });
    const probability = hourly?.precipitation_probability?.[i];
    const rain = hourly?.rain?.[i];
    const showers = hourly?.showers?.[i];
    if (!end.isValid || end.toFormat("yyyy-MM-dd'T'HH:mm") !== time || start.toISODate() !== today.date ||
        !validNumber(probability, 100) || !validNumber(rain) || !validNumber(showers)) return [];
    return [{
      startTime: start.toFormat("HH:mm"),
      endTime: end.toISODate() === today.date ? end.toFormat("HH:mm") : "24:00",
      precipitationProbability: probability,
      rainMillimeters: rain + showers,
    }];
  });
}

function validNumber(value: unknown, max = Infinity): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
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
