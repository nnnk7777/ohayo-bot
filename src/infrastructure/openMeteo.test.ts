import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenMeteoWeatherProvider } from "./openMeteo.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenMeteoWeatherProvider", () => {
  it("体感温度・UV・最大風速を含めて天気を取得する", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        current: { temperature_2m: 26, weather_code: 1 },
        daily: {
          temperature_2m_min: [22],
          temperature_2m_max: [32],
          apparent_temperature_min: [23],
          apparent_temperature_max: [35],
          precipitation_probability_max: [10],
          uv_index_max: [8],
          wind_speed_10m_max: [31],
          weather_code: [1],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const weather = await new OpenMeteoWeatherProvider({ latitude: 35.7, longitude: 139.5 }).getWeather({
      date: "2026-09-02",
      timeZone: "Asia/Tokyo",
    });

    expect(weather).toEqual({
      condition: "clear",
      currentCelsius: 26,
      lowCelsius: 22,
      highCelsius: 32,
      rainProbability: 10,
      apparentLowCelsius: 23,
      apparentHighCelsius: 35,
      maxUvIndex: 8,
      maxWindSpeedKmh: 31,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("uv_index_max");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("wind_speed_10m_max");
  });
});
