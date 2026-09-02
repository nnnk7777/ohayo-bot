import { describe, expect, it } from "vitest";
import { planMorningBriefing, upcomingBriefingDates } from "./morningBriefing.js";

describe("planMorningBriefing", () => {
  it("天気を丸め、最初の3件の予定と傘の案内をまとめる", () => {
    const plan = planMorningBriefing({
      date: "2026-09-01",
      locationName: "武蔵野市",
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
    expect(plan.locationName).toBe("武蔵野市");
    expect(plan.agenda).toEqual({
      items: [
        { title: "朝の予定", startTime: "09:00", isAllDay: false },
        { title: "昼の予定", startTime: "12:00", isAllDay: false },
        { title: "夕方の予定", startTime: "17:00", isAllDay: false },
      ],
      remainingCount: 1,
    });
    expect(plan.targetDurationSeconds).toBe(55);
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
    expect(plan.targetDurationSeconds).toBe(20);
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
    expect(plan.targetDurationSeconds).toBe(35);
  });

  it("雨でも外出の見込みに応じて傘の案内を切り替える", () => {
    const weather = {
      condition: "rain" as const,
      currentCelsius: 20,
      lowCelsius: 18,
      highCelsius: 22,
      rainProbability: 70,
    };

    const goingOut = planMorningBriefing({
      date: "2026-09-01",
      weather,
      schedules: [{ title: "外出予定", startTime: "10:00", isAllDay: false }],
      isLikelyGoingOut: true,
    });
    const stayingHome = planMorningBriefing({
      date: "2026-09-01",
      weather,
      schedules: [],
      isLikelyGoingOut: false,
    });

    expect(goingOut.weather.umbrellaAdvice).toBe("雨の可能性があるため、傘があると安心です。");
    expect(goingOut.targetDurationSeconds).toBe(35);
    expect(stayingHome.weather.umbrellaAdvice).toBeUndefined();
    expect(stayingHome.targetDurationSeconds).toBe(20);
  });

  it("月曜は今週最初の予定を補足し、原稿を少し長くする", () => {
    const plan = planMorningBriefing({
      date: "2026-09-07",
      weather: { condition: "clear", currentCelsius: 24, lowCelsius: 20, highCelsius: 29, rainProbability: 0 },
      schedules: [],
      upcomingScheduleDays: [
        { date: "2026-09-09", schedules: [{ title: "企画レビュー", startTime: "10:00", isAllDay: false }] },
      ],
    });

    expect(plan.weekdayFocus).toEqual({
      period: "this-week",
      date: "2026-09-09",
      item: { title: "企画レビュー", startTime: "10:00", isAllDay: false },
    });
    expect(plan.targetDurationSeconds).toBe(35);
  });

  it("金曜は週末から翌月曜の最初の予定を補足する", () => {
    const plan = planMorningBriefing({
      date: "2026-09-11",
      weather: { condition: "cloudy", currentCelsius: 23, lowCelsius: 20, highCelsius: 27, rainProbability: 20 },
      schedules: [],
      upcomingScheduleDays: [
        { date: "2026-09-14", schedules: [{ title: "歯科", startTime: "09:30", isAllDay: false }] },
      ],
    });

    expect(plan.weekdayFocus?.period).toBe("weekend-and-monday");
    expect(plan.weekdayFocus?.date).toBe("2026-09-14");
  });

  it("月曜・金曜以外と祝日は先の予定を補足しない", () => {
    expect(upcomingBriefingDates("2026-09-08")).toEqual([]);
    expect(upcomingBriefingDates("2026-09-07", true)).toEqual([]);
  });
});
