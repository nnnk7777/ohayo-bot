import { DateTime } from "luxon";
import type { HourlyPrecipitation, Weather, WeatherCondition } from "../domain/morningBriefing.js";
import type { Today, WeatherProvider } from "../application/ports.js";
import type { HourlyWeatherCondition } from "../domain/remainingWeather.js";

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
  daily?: {
    time?: string[];
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
    temperature_2m?: (number | null)[];
    weather_code?: (number | null)[];
  };
};

export class OpenMeteoWeatherProvider implements WeatherProvider {
  constructor(
    private readonly location: { latitude: number; longitude: number },
  ) {}

  async getWeather(today: Today): Promise<Weather> {
    const yesterday = DateTime.fromISO(today.date, { zone: today.timeZone }).minus({ days: 1 }).toISODate()!;
    const params = new URLSearchParams({
      latitude: String(this.location.latitude),
      longitude: String(this.location.longitude),
      timezone: today.timeZone,
      start_date: yesterday,
      end_date: today.date,
      // 降水量・降水確率は時刻ラベルの「直前1時間」。翌日00:00まで取得して23時台も含める。
      start_hour: `${yesterday}T01:00`,
      end_hour: `${DateTime.fromISO(today.date, { zone: today.timeZone }).plus({ days: 1 }).toISODate()}T00:00`,
      hourly: "precipitation_probability,rain,showers,temperature_2m,weather_code",
      current: "temperature_2m,weather_code",
      daily:
        "weather_code,temperature_2m_min,temperature_2m_max,apparent_temperature_min,apparent_temperature_max,precipitation_probability_max,uv_index_max,wind_speed_10m_max",
    });
    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    const data = await requestForecast(url, 10_000).catch((error: unknown) => {
      if (error instanceof Error && (error.name === "TimeoutError" ||
        (error instanceof TypeError && error.message === "fetch failed"))) {
        return requestForecast(url, 5_000);
      }
      throw error;
    });
    const dayIndex = data.daily?.time?.indexOf(today.date) ?? -1;
    if (dayIndex < 0) throw new Error("天気APIの応答に当日の情報がありません。");
    const previousIndex = data.daily?.time?.indexOf(yesterday) ?? -1;
    const currentTemperature = data.current?.temperature_2m;
    const low = data.daily?.temperature_2m_min?.[dayIndex];
    const high = data.daily?.temperature_2m_max?.[dayIndex];
    const rainProbability = data.daily?.precipitation_probability_max?.[dayIndex];
    const weatherCode = data.current?.weather_code;
    const hourlyPrecipitation = precipitationPeriods(data.hourly, today);
    const hourlyConditions = conditionTimes(data.hourly, today);

    if (
      !temperature(currentTemperature) ||
      !temperature(low) ||
      !temperature(high) ||
      !validNumber(rainProbability, 100) ||
      !validNumber(weatherCode, 99)
    ) {
      throw new Error("天気APIの応答に必要な情報がありません。");
    }

    return {
      condition: weatherConditionFromCode(weatherCode),
      currentCelsius: currentTemperature,
      lowCelsius: low,
      highCelsius: high,
      rainProbability,
      apparentLowCelsius: data.daily?.apparent_temperature_min?.[dayIndex],
      apparentHighCelsius: data.daily?.apparent_temperature_max?.[dayIndex],
      maxUvIndex: data.daily?.uv_index_max?.[dayIndex],
      maxWindSpeedKmh: data.daily?.wind_speed_10m_max?.[dayIndex],
      ...(previousIndex >= 0 && temperature(data.daily?.temperature_2m_max?.[previousIndex])
        ? { previousDayHighCelsius: data.daily!.temperature_2m_max![previousIndex] } : {}),
      ...temperaturePeriods(data.hourly, today),
      ...(hourlyPrecipitation.length ? { hourlyPrecipitation } : {}),
      ...(hourlyConditions.length ? { hourlyConditions } : {}),
    };
  }
}

async function requestForecast(url: string, timeoutMs: number): Promise<OpenMeteoResponse> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw Object.assign(new Error(`天気の取得に失敗しました (${response.status})。`), { status: response.status });
  }
  return response.json() as Promise<OpenMeteoResponse>;
}

function conditionTimes(hourly: OpenMeteoResponse["hourly"], today: Today): HourlyWeatherCondition[] {
  if (!Array.isArray(hourly?.time)) return [];
  return hourly.time.flatMap((time, index) => {
    const code = hourly.weather_code?.[index];
    if (typeof time !== "string" || !time.startsWith(`${today.date}T`) ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):00$/.test(time) ||
      !validNumber(code, 99) || !Number.isInteger(code)) return [];
    return [{ time: time.slice(11), condition: weatherConditionFromCode(code) }];
  });
}

function temperature(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -100 && value <= 70;
}

function temperaturePeriods(hourly: OpenMeteoResponse["hourly"], today: Today) {
  if (!Array.isArray(hourly?.time) || !Array.isArray(hourly?.temperature_2m)) return {};
  const values = (hours: number[]) => hours.map(hour => {
    const label = `${today.date}T${String(hour).padStart(2, "0")}:00`;
    const index = hourly?.time?.indexOf(label) ?? -1;
    return index < 0 ? undefined : hourly?.temperature_2m?.[index];
  });
  // 最低気温だけでは、明け方の寒さと夕方以降の冷え込みを区別できない。
  const daytime = values([12, 13, 14, 15, 16]);
  const evening = values([18, 19, 20, 21, 22]);
  if (!daytime.every(temperature) || !evening.every(temperature)) return {};
  return { daytimeHighCelsius: Math.max(...daytime), eveningLowCelsius: Math.min(...evening) };
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
