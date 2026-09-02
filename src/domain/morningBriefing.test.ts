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
        { title: "夜の予定", startTime: "19:00", isAllDay: false },
      ],
    });
    expect(plan.targetDurationSeconds).toBe(70);
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
    expect(plan.closing).toEqual({ kind: "neutral", style: "gentle" });
    expect(plan.weather.umbrellaAdvice).toBeUndefined();
    expect(plan.agenda).toBeUndefined();
    expect(plan.targetDurationSeconds).toBe(20);
  });

  it("日付ごとにニュートラルな締めの方向性を変える", () => {
    const weather = {
      condition: "clear" as const,
      currentCelsius: 20,
      lowCelsius: 15,
      highCelsius: 25,
      rainProbability: 0,
    };

    expect(planMorningBriefing({ date: "2026-09-01", weather, schedules: [] }).closing).toEqual({
      kind: "neutral",
      style: "gentle",
    });
    expect(planMorningBriefing({ date: "2026-09-02", weather, schedules: [] }).closing).toEqual({
      kind: "neutral",
      style: "plain",
    });
  });

  it("天気の注意がない予定の日は、予定の文脈で締める", () => {
    const plan = planMorningBriefing({
      date: "2026-09-01",
      weather: { condition: "clear", currentCelsius: 20, lowCelsius: 15, highCelsius: 25, rainProbability: 0 },
      schedules: [{ title: "朝会", startTime: "09:00", isAllDay: false }],
    });

    expect(plan.closing).toEqual({ kind: "schedule-context" });
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
    expect(plan.closing).toEqual({ kind: "weather-advice" });
    expect(plan.targetDurationSeconds).toBe(35);
  });

  it("暑さ・日差し・風の注意はしきい値を超えた場合だけ最大2件に絞る", () => {
    const plan = planMorningBriefing({
      date: "2026-09-01",
      weather: {
        condition: "clear",
        currentCelsius: 28,
        lowCelsius: 25,
        highCelsius: 34,
        rainProbability: 0,
        apparentHighCelsius: 36,
        maxUvIndex: 8,
        maxWindSpeedKmh: 35,
      },
      schedules: [],
    });

    expect(plan.weather.seasonalAdvice).toEqual([
      "日中は体感的にも暑くなりそうです。",
      "日差しが強そうです。",
    ]);
    expect(plan.closing).toEqual({ kind: "weather-advice" });
    expect(plan.targetDurationSeconds).toBe(35);
  });

  it("季節情報がしきい値未満なら注意を加えない", () => {
    const plan = planMorningBriefing({
      date: "2026-09-01",
      weather: {
        condition: "clear",
        currentCelsius: 20,
        lowCelsius: 16,
        highCelsius: 24,
        rainProbability: 0,
        apparentLowCelsius: 12,
        apparentHighCelsius: 25,
        maxUvIndex: 4,
        maxWindSpeedKmh: 20,
      },
      schedules: [],
    });

    expect(plan.weather.seasonalAdvice).toBeUndefined();
    expect(plan.targetDurationSeconds).toBe(20);
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

  it("在宅想定では、強風など外出向けの季節情報を加えない", () => {
    const plan = planMorningBriefing({
      date: "2026-09-01",
      weather: {
        condition: "cloudy",
        currentCelsius: 20,
        lowCelsius: 15,
        highCelsius: 25,
        rainProbability: 0,
        maxWindSpeedKmh: 35,
      },
      schedules: [],
      isLikelyGoingOut: false,
    });

    expect(plan.weather.seasonalAdvice).toBeUndefined();
    expect(plan.closing).toMatchObject({ kind: "neutral" });
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
