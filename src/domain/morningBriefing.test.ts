import { describe, expect, it } from "vitest";
import { planMorningBriefing } from "./morningBriefing.js";

describe("planMorningBriefing", () => {
  it("天気を丸め、最初の3件の予定と傘の案内をまとめる", () => {
    const plan = planMorningBriefing({
      date: "2026-09-01",
      weather: {
        condition: "cloudy",
        currentCelsius: 25.4,
        lowCelsius: 22.2,
        highCelsius: 30.6,
        rainProbability: 40,
      },
      schedules: [
        { title: "朝の予定", startTime: "09:00", isAllDay: false },
        { title: "昼の予定", startTime: "12:00", isAllDay: false },
        { title: "夕方の予定", startTime: "17:00", isAllDay: false },
        { title: "夜の予定", startTime: "19:00", isAllDay: false },
      ],
    });

    expect(plan.weather).toEqual({
      condition: "くもり",
      currentCelsius: 25,
      lowCelsius: 22,
      highCelsius: 31,
      umbrellaAdvice: "雨の可能性があるため、傘があると安心です。",
    });
    expect(plan.agenda).toEqual({
      items: [
        { title: "朝の予定", startTime: "09:00", isAllDay: false },
        { title: "昼の予定", startTime: "12:00", isAllDay: false },
        { title: "夕方の予定", startTime: "17:00", isAllDay: false },
      ],
      remainingCount: 1,
    });
    expect(plan.targetDurationSeconds).toBe(45);
  });

  it("予定がない場合は予定の節を作らず、短い原稿を選ぶ", () => {
    const plan = planMorningBriefing({
      date: "2026-09-01",
      weather: {
        condition: "clear",
        currentCelsius: 25,
        lowCelsius: 22,
        highCelsius: 30,
        rainProbability: 0,
      },
      schedules: [],
    });

    expect(plan.weather.condition).toBe("晴れ");
    expect(plan.weather.umbrellaAdvice).toBeUndefined();
    expect(plan.agenda).toBeUndefined();
    expect(plan.targetDurationSeconds).toBe(30);
  });

  it("降水確率が低くても雨なら傘を案内する", () => {
    const plan = planMorningBriefing({
      date: "2026-09-01",
      weather: {
        condition: "rain",
        currentCelsius: 20,
        lowCelsius: 18,
        highCelsius: 22,
        rainProbability: 10,
      },
      schedules: [],
    });

    expect(plan.weather.umbrellaAdvice).toBe("雨の可能性があるため、傘があると安心です。");
  });
});
