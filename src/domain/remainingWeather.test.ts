import { describe, expect, it } from "vitest";
import { remainingConditions, remainingPrecipitation, weatherOutlook } from "./remainingWeather.js";
import { planMorningBriefing, type Weather } from "./morningBriefing.js";

const weather: Weather = { condition: "clear", currentCelsius: 20, lowCelsius: 15, highCelsius: 25, rainProbability: 90 };
const rain = (startTime: string, endTime: string, precipitationProbability = 80) => ({ startTime, endTime, precipitationProbability, rainMillimeters: 1 });
const plan = (value: Weather, fromTime = "08:30") => planMorningBriefing({ date: "2030-04-01", fromTime, weather: value, schedules: [] });

describe("これからの天気", () => {
  it("今の晴れと午後の雨を別の事実として渡す", () => {
    const result = plan({ ...weather, hourlyConditions: [
      { time: "03:00", condition: "snow" }, { time: "09:00", condition: "clear" },
      { time: "12:00", condition: "cloudy" }, { time: "15:00", condition: "rain" }, { time: "19:00", condition: "rain" },
    ] });
    expect(result.weather.currentCondition).toBe("晴れ");
    expect(result.weather.outlook).toEqual([
      { period: "午後", conditions: ["くもり", "雨"] }, { period: "夜", conditions: ["雨"] },
    ]);
    expect(result.weather).not.toHaveProperty("condition");
    expect(result.weather.umbrellaAdvice).toBeDefined();
  });
  it("未明の雨と一日の高い降水確率だけでは傘を勧めない", () => {
    const result = plan({ ...weather, hourlyPrecipitation: [rain("03:00", "04:00")],
      hourlyConditions: [{ time: "03:00", condition: "rain" }, { time: "12:00", condition: "clear" }] });
    expect(result.weather.umbrellaAdvice).toBeUndefined();
    expect(result.weather.outlook).toBeUndefined();
  });
  it("予報が欠けても日全体の降水確率に戻さず、晴れるとも断定しない", () => {
    expect(plan(weather).weather.umbrellaAdvice).toBeUndefined();
    expect(plan(weather).weather.outlook).toBeUndefined();
    expect(plan({ ...weather, condition: "rain" }).weather.umbrellaAdvice).toBeDefined();
  });
  it("午後の実行では朝の雨を除き、23時台の予報も扱う", () => {
    expect(plan({ ...weather, hourlyPrecipitation: [rain("08:00", "09:00")] }, "14:00").weather.umbrellaAdvice).toBeUndefined();
    expect(plan({ ...weather, hourlyPrecipitation: [rain("23:00", "24:00")] }, "22:30").weather.umbrellaAdvice).toBeDefined();
  });
  it("境界で終わった降水は除き、進行中の1時間枠は残す", () => {
    const periods = [rain("07:00", "08:00"), rain("08:00", "09:00"), rain("09:00", "10:00")];
    expect(remainingPrecipitation(periods, "08:00")).toEqual(periods.slice(1));
    expect(remainingPrecipitation(periods, "08:30")).toEqual(periods.slice(1));
    expect(remainingPrecipitation(periods, "09:00")).toEqual(periods.slice(2));
  });
  it("過ぎた予定に傘の案内を結び付けず、予定そのものは残す", () => {
    const schedule = { title: "架空の訪問", startTime: "08:00", isAllDay: false, requiresGoingOut: true };
    const result = planMorningBriefing({ date: "2030-04-01", fromTime: "08:30", schedules: [schedule],
      weather: { ...weather, hourlyPrecipitation: [rain("08:00", "09:00")] } });
    expect(result.weather.scheduleContext).toBeUndefined();
    expect(result.agenda?.items).toEqual([schedule]);
  });
  it("weather_codeの瞬時値を直前1時間へずらさず、過去の値は除く", () => {
    expect(remainingConditions([{ time: "08:00", condition: "rain" }, { time: "09:00", condition: "cloudy" }], "08:30"))
      .toEqual([{ time: "09:00", condition: "cloudy" }]);
  });
  it("変化なしや不正な時刻では予報を作らない", () => {
    expect(weatherOutlook([{ time: "12:00", condition: "clear" }], "clear")).toEqual([]);
    expect(remainingConditions([{ time: "25:00", condition: "rain" }], "08:00")).toEqual([]);
    expect(remainingPrecipitation([rain("03:00", "04:00")], "invalid")).toEqual([]);
  });
});
