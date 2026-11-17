import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenMeteoWeatherProvider } from "./openMeteo.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenMeteoWeatherProvider", () => {
  const base = {
    current: { temperature_2m: 20, weather_code: 1 },
    daily: { time: ["2026-10-27"], temperature_2m_min: [15], temperature_2m_max: [25], precipitation_probability_max: [70] },
  };
  const today = { date: "2026-10-27", timeZone: "Asia/Tokyo" };

  it("タイムアウト時だけ短い制限時間で再試行できる", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new DOMException("test", "TimeoutError"))
      .mockResolvedValueOnce({ ok: true, json: async () => base });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new OpenMeteoWeatherProvider({ latitude: 0, longitude: 0 }).getWeather(today))
      .resolves.toMatchObject({ currentCelsius: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(fetchMock.mock.calls[1][0]);
  });

  it("連続する通信エラーは1回で再試行を打ち切る", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new OpenMeteoWeatherProvider({ latitude: 0, longitude: 0 }).getWeather(today)).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("現在の晴れと午後の雨を別々に返し、天気コードの時刻をずらさない", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      ...base, daily: { ...base.daily, weather_code: [61] },
      hourly: { time: ["2026-10-26T15:00", `${today.date}T09:00`, `${today.date}T15:00`, "2026-10-28T00:00"],
        weather_code: [61, 1, 61, 61] },
    }) }));
    const result = await new OpenMeteoWeatherProvider({ latitude: 0, longitude: 0 }).getWeather(today);
    expect(result.condition).toBe("clear");
    expect(result.hourlyConditions).toEqual([{ time: "09:00", condition: "clear" }, { time: "15:00", condition: "rain" }]);
  });

  it("現在の天気コードが欠けたら一日の最も厳しい天気で代用しない", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      ...base, current: { temperature_2m: 20 }, daily: { ...base.daily, weather_code: [61] },
    }) }));
    await expect(new OpenMeteoWeatherProvider({ latitude: 0, longitude: 0 }).getWeather(today)).rejects.toThrow("必要な情報");
  });

  it("不正な時間別コードを除いても通常の天気取得は続ける", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      ...base, hourly: { time: [`${today.date}T12:00`, `${today.date}T13:00`, `${today.date}T14:30`, `${today.date}T99:00`],
        weather_code: [null, 61.5, 61, 61] },
    }) }));
    const result = await new OpenMeteoWeatherProvider({ latitude: 0, longitude: 0 }).getWeather(today);
    expect(result.condition).toBe("clear");
    expect(result.hourlyConditions).toBeUndefined();
  });

  it("前日・当日を日付で選び、雨量の区間と気温の瞬時値を別々に扱う", async () => {
    const hours = [12, 13, 14, 15, 16, 18, 19, 20, 21, 22];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      current: { temperature_2m: 16, weather_code: 1 },
      daily: { time: ["2026-10-26", today.date], temperature_2m_min: [10, 8], temperature_2m_max: [30, 23],
        precipitation_probability_max: [90, 10], uv_index_max: [8, 3] },
      hourly: { time: hours.map(h => `${today.date}T${h}:00`), temperature_2m: [22, 23, 23, 22, 21, 18, 17, 16, 15, 14] },
    }) }));
    const weather = await new OpenMeteoWeatherProvider({ latitude: 0, longitude: 0 }).getWeather(today);
    expect(weather).toMatchObject({ highCelsius: 23, lowCelsius: 8, rainProbability: 10, maxUvIndex: 3,
      previousDayHighCelsius: 30, daytimeHighCelsius: 23, eveningLowCelsius: 14 });
  });

  it.each([null, NaN, undefined])("前日や夜の欠損時はその比較だけ省き、当日の天気を維持する: %j", missing => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      ...base,
      daily: { time: ["2026-10-26", today.date], temperature_2m_min: [10, 15], temperature_2m_max: [missing, 25],
        precipitation_probability_max: [0, 70] },
      hourly: { time: [`${today.date}T12:00`, `${today.date}T18:00`], temperature_2m: [25, missing] },
    }) }));
    return new OpenMeteoWeatherProvider({ latitude: 0, longitude: 0 }).getWeather(today).then(weather => {
      expect(weather.highCelsius).toBe(25);
      expect(weather.previousDayHighCelsius).toBeUndefined();
      expect(weather.eveningLowCelsius).toBeUndefined();
    });
  });

  it("当日がない場合に前日の天気を読み上げない", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      ...base, daily: { ...base.daily, time: ["2026-10-26"] },
    }) }));
    await expect(new OpenMeteoWeatherProvider({ latitude: 0, longitude: 0 }).getWeather(today)).rejects.toThrow("当日の情報");
  });

  it("年をまたぐ前日も設定タイムゾーンの日付で要求する", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      ...base, daily: { ...base.daily, time: ["2027-01-01"] },
    }) });
    vi.stubGlobal("fetch", fetchMock);
    await new OpenMeteoWeatherProvider({ latitude: 0, longitude: 0 }).getWeather({ ...today, date: "2027-01-01" });
    const params = new URL(String(fetchMock.mock.calls[0][0])).searchParams;
    expect(params.get("start_date")).toBe("2026-12-31");
    expect(params.get("end_hour")).toBe("2027-01-02T00:00");
  });

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
    expect(params.get("start_hour")).toBe("2026-10-26T01:00");
    expect(params.get("start_date")).toBe("2026-10-26");
    expect(params.get("end_hour")).toBe("2026-10-28T00:00");
    expect(params.get("hourly")).toBe("precipitation_probability,rain,showers,temperature_2m,weather_code");
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
          time: ["2026-09-02"],
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

    const weather = await new OpenMeteoWeatherProvider({ latitude: 0, longitude: 0 }).getWeather({
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
