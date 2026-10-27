import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenMeteoWeatherProvider } from "./openMeteo.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenMeteoWeatherProvider", () => {
  const base = {
    current: { temperature_2m: 20, weather_code: 1 },
    daily: { temperature_2m_min: [15], temperature_2m_max: [25], precipitation_probability_max: [70] },
  };
  const today = { date: "2026-10-27", timeZone: "Asia/Tokyo" };

  it("直前1時間の雨量・降水確率を当日の時間帯に変換し、23時台も取得する", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      ...base,
      hourly: {
        time: ["2026-10-27T00:00", "2026-10-27T19:00", "2026-10-28T00:00", "2026-10-28T01:00"],
        precipitation_probability: [80, 70, 60, 90], rain: [1, 0.2, 0, 1], showers: [0, 0.3, 0.4, 0],
      },
    }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await new OpenMeteoWeatherProvider({ latitude: 0, longitude: 0 }).getWeather(today);
    expect(result.hourlyPrecipitation).toEqual([
      { startTime: "18:00", endTime: "19:00", precipitationProbability: 70, rainMillimeters: 0.5 },
      { startTime: "23:00", endTime: "24:00", precipitationProbability: 60, rainMillimeters: 0.4 },
    ]);
    const params = new URL(String(fetchMock.mock.calls[0][0])).searchParams;
    expect(params.get("start_hour")).toBe("2026-10-27T01:00");
    expect(params.get("end_hour")).toBe("2026-10-28T00:00");
    expect(params.get("hourly")).toBe("precipitation_probability,rain,showers");
    expect(params.get("timezone")).toBe("Asia/Tokyo");
    expect(params.get("end_date")).toBe(today.date);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    undefined,
    { time: null },
    { time: "invalid" },
    { time: ["2026-10-27T19:00"], precipitation_probability: [70], rain: [null], showers: [0] },
    { time: ["2026-10-27T19:00"], precipitation_probability: [101], rain: [1], showers: [0] },
    { time: ["2026-10-27T19:00"], precipitation_probability: [NaN], rain: [1], showers: [0] },
    { time: ["2026-10-27T19:00"], precipitation_probability: [70], rain: [-1], showers: [0] },
    { time: ["2026-10-27T19:00"], precipitation_probability: [70], rain: [1], showers: [] },
    { time: ["2026-10-27T99:00"], precipitation_probability: [70], rain: [1], showers: [0] },
    { time: ["2026-10-27T19:30"], precipitation_probability: [70], rain: [1], showers: [0] },
  ])("時間帯別データが使えなくても日全体の天気は返す: %j", async hourly => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...base, hourly }) }));
    const weather = await new OpenMeteoWeatherProvider({ latitude: 0, longitude: 0 }).getWeather(today);
    expect(weather.currentCelsius).toBe(20);
    expect(weather.hourlyPrecipitation).toBeUndefined();
  });

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
