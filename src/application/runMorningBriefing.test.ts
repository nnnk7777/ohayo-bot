import { afterEach, describe, expect, it, vi } from "vitest";
import { runMorningBriefing } from "./runMorningBriefing.js";

const today = { date: "2026-09-01", timeZone: "Asia/Tokyo" };
const personalProfile = {
  dailyRoutine: { officeWeekdays: [1, 3, 4] as const, remoteWeekdays: [2, 5] as const },
  scheduleRules: {
    excludedTitles: [], excludedTitleFragments: [], exactTitleRules: [], prefixRules: [],
    suffixRules: [], personOnlyTitles: [],
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runMorningBriefing", () => {
  it("天気と予定から原稿を作り、読み上げる", async () => {
    const scheduleProvider = {
      getSchedules: vi.fn().mockResolvedValue([]),
    };
    const weatherProvider = {
      getWeather: vi.fn().mockResolvedValue({
        condition: "clear",
        currentCelsius: 25,
        lowCelsius: 22,
        highCelsius: 30,
        rainProbability: 0,
      }),
    };
    const holidayProvider = { isHoliday: vi.fn().mockResolvedValue(false) };
    const narrator = {
      narrate: vi.fn().mockResolvedValue("9月1日、武蔵野市は晴れです。"),
    };
    const speaker = { speak: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const briefing = await runMorningBriefing(
      { personalProfile, scheduleProvider, weatherProvider, holidayProvider, narrator, speaker },
      { today, locationName: "武蔵野市", speak: true },
    );

    expect(briefing).toBe("おはようございます。\n\n9月1日、武蔵野市は晴れです。");
    expect(narrator.narrate).toHaveBeenCalledWith(expect.objectContaining({
      date: today.date,
      locationName: "武蔵野市",
    }));
    expect(speaker.speak).toHaveBeenCalledWith("おはようございます。\n\n9月1日、武蔵野市は晴れです。");
  });

  it("--no-speech相当では読み上げない", async () => {
    const speaker = { speak: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runMorningBriefing(
      {
        personalProfile,
        scheduleProvider: { getSchedules: vi.fn().mockResolvedValue([]) },
        weatherProvider: {
          getWeather: vi.fn().mockResolvedValue({
            condition: "clear",
            currentCelsius: 25,
            lowCelsius: 22,
            highCelsius: 30,
            rainProbability: 0,
          }),
        },
        holidayProvider: { isHoliday: vi.fn().mockResolvedValue(false) },
        narrator: { narrate: vi.fn().mockResolvedValue("原稿です。") },
        speaker,
      },
      { today, speak: false },
    );

    expect(speaker.speak).not.toHaveBeenCalled();
  });

  it("月曜は今週の予定を取得し、最初の予定を原稿の補足へ渡す", async () => {
    const scheduleProvider = {
      getSchedules: vi.fn().mockImplementation(async (day: { date: string }) => (
        day.date === "2026-09-09"
          ? [{ title: "企画レビュー", startTime: "10:00", isAllDay: false }]
          : []
      )),
    };
    const narrator = { narrate: vi.fn().mockResolvedValue("今週の予定があります。") };
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runMorningBriefing(
      {
        personalProfile,
        scheduleProvider,
        weatherProvider: {
          getWeather: vi.fn().mockResolvedValue({
            condition: "clear",
            currentCelsius: 24,
            lowCelsius: 20,
            highCelsius: 29,
            rainProbability: 0,
          }),
        },
        holidayProvider: { isHoliday: vi.fn().mockResolvedValue(false) },
        narrator,
        speaker: { speak: vi.fn().mockResolvedValue(undefined) },
      },
      { today: { date: "2026-09-07", timeZone: "Asia/Tokyo" }, speak: false },
    );

    expect(scheduleProvider.getSchedules).toHaveBeenCalledTimes(7);
    expect(narrator.narrate).toHaveBeenCalledWith(expect.objectContaining({
      weekdayFocus: expect.objectContaining({
        period: "this-week",
        date: "2026-09-09",
        item: expect.objectContaining({ title: "企画レビュー" }),
      }),
    }));
  });

  it("月曜は個人ルール適用後の当日予定を今週最初として渡す", async () => {
    const scheduleProvider = {
      getSchedules: vi.fn().mockImplementation(async (day: { date: string }) => {
        if (day.date === "2026-09-07") {
          return [
            { title: "先週の予算差分メモ", isAllDay: true },
            { title: "🍽️友人A", startTime: "22:00", isAllDay: false },
          ];
        }
        if (day.date === "2026-09-08") {
          return [{ title: "コミック5巻発売", isAllDay: true }];
        }
        return [];
      }),
    };
    const narrator = { narrate: vi.fn().mockResolvedValue("原稿です。") };
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runMorningBriefing(
      {
        personalProfile: {
          ...personalProfile,
          scheduleRules: {
            ...personalProfile.scheduleRules,
            excludedTitleFragments: ["予算差分メモ"],
            prefixRules: [{
              prefix: "🍽️",
              hint: "誰かと食事に行く予定を表す個人用の記法です。",
              detailHints: [{
                detail: "友人A",
                hint: "友人Aは友人の名前です。原稿では「友人Aさん」と呼んでください。",
              }],
            }],
          },
        },
        scheduleProvider,
        weatherProvider: {
          getWeather: vi.fn().mockResolvedValue({
            condition: "cloudy", currentCelsius: 23, lowCelsius: 22, highCelsius: 24, rainProbability: 40,
          }),
        },
        holidayProvider: { isHoliday: vi.fn().mockResolvedValue(false) },
        narrator,
        speaker: { speak: vi.fn().mockResolvedValue(undefined) },
      },
      { today: { date: "2026-09-07", timeZone: "Asia/Tokyo" }, speak: false },
    );

    expect(narrator.narrate).toHaveBeenCalledWith(expect.objectContaining({
      weekdayFocus: {
        period: "this-week",
        date: "2026-09-07",
        item: expect.objectContaining({
          title: "🍽️友人A",
          startTime: "22:00",
          briefingHints: [
            "誰かと食事に行く予定を表す個人用の記法です。",
            "友人Aは友人の名前です。原稿では「友人Aさん」と呼んでください。",
          ],
        }),
      },
    }));
  });

  it("個人用の予定ルールを適用してから原稿を作る", async () => {
    const narrator = { narrate: vi.fn().mockResolvedValue("原稿です。") };
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runMorningBriefing(
      {
        personalProfile: {
          ...personalProfile,
          scheduleRules: {
            ...personalProfile.scheduleRules,
            excludedTitles: ["💰節制モード"],
            exactTitleRules: [{ title: "💈Roberts", briefingTitle: "美容院の予約", requiresGoingOut: true }],
          },
        },
        scheduleProvider: {
          getSchedules: vi.fn().mockResolvedValue([
            { title: "💰節制モード", isAllDay: true },
            { title: "💈Roberts", startTime: "11:00", isAllDay: false },
          ]),
        },
        weatherProvider: {
          getWeather: vi.fn().mockResolvedValue({
            condition: "rain", currentCelsius: 20, lowCelsius: 18, highCelsius: 23, rainProbability: 70,
          }),
        },
        holidayProvider: { isHoliday: vi.fn().mockResolvedValue(false) },
        narrator,
        speaker: { speak: vi.fn().mockResolvedValue(undefined) },
      },
      { today: { date: "2026-09-01", timeZone: "Asia/Tokyo" }, speak: false },
    );

    expect(narrator.narrate).toHaveBeenCalledWith(expect.objectContaining({
      agenda: { items: [{ title: "美容院の予約", startTime: "11:00", isAllDay: false, requiresGoingOut: true }] },
      weather: expect.objectContaining({ umbrellaAdvice: "雨の可能性があるため、傘があると安心です。" }),
    }));
  });

  it("出社日は運行情報を確認し、異常だけを原稿へ渡す", async () => {
    const narrator = { narrate: vi.fn().mockResolvedValue("中央線に遅れがあります。") };
    const trainStatusProvider = {
      getStatuses: vi.fn().mockResolvedValue([
        { lineName: "中央線快速電車", state: "disrupted", detail: "一部列車に遅れがでています。", sourceUrl: "https://example.com/jr" },
        { lineName: "南北線", state: "normal", sourceUrl: "https://example.com/metro" },
      ]),
    };
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runMorningBriefing(
      {
        personalProfile: {
          ...personalProfile,
          dailyRoutine: {
            ...personalProfile.dailyRoutine,
            commute: {
              segments: [{
                from: "三鷹", to: "四ツ谷", lineName: "中央線快速電車",
                source: { kind: "jr-east", officialUrl: "https://example.com/jr" },
              }],
            },
          },
        },
        scheduleProvider: { getSchedules: vi.fn().mockResolvedValue([]) },
        weatherProvider: {
          getWeather: vi.fn().mockResolvedValue({
            condition: "clear", currentCelsius: 20, lowCelsius: 18, highCelsius: 25, rainProbability: 0,
          }),
        },
        holidayProvider: { isHoliday: vi.fn().mockResolvedValue(false) },
        trainStatusProvider,
        narrator,
        speaker: { speak: vi.fn().mockResolvedValue(undefined) },
      },
      { today: { date: "2026-09-09", timeZone: "Asia/Tokyo" }, speak: false },
    );

    expect(trainStatusProvider.getStatuses).toHaveBeenCalledOnce();
    expect(narrator.narrate).toHaveBeenCalledWith(expect.objectContaining({
      commute: {
        issues: [expect.objectContaining({ lineName: "中央線快速電車", state: "disrupted" })],
        guidance: expect.any(String),
      },
    }));
  });

  it("在宅勤務日は運行情報を取得しない", async () => {
    const narrator = { narrate: vi.fn().mockResolvedValue("原稿です。") };
    const trainStatusProvider = { getStatuses: vi.fn().mockResolvedValue([]) };
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runMorningBriefing(
      {
        personalProfile: {
          ...personalProfile,
          dailyRoutine: {
            ...personalProfile.dailyRoutine,
            commute: {
              segments: [{
                from: "三鷹", to: "四ツ谷", lineName: "中央線快速電車",
                source: { kind: "jr-east", officialUrl: "https://example.com/jr" },
              }],
            },
          },
        },
        scheduleProvider: { getSchedules: vi.fn().mockResolvedValue([{ title: "在宅勤務", isAllDay: true }]) },
        weatherProvider: {
          getWeather: vi.fn().mockResolvedValue({
            condition: "clear", currentCelsius: 20, lowCelsius: 18, highCelsius: 25, rainProbability: 0,
          }),
        },
        holidayProvider: { isHoliday: vi.fn().mockResolvedValue(false) },
        trainStatusProvider,
        narrator,
        speaker: { speak: vi.fn().mockResolvedValue(undefined) },
      },
      { today: { date: "2026-09-09", timeZone: "Asia/Tokyo" }, speak: false },
    );

    expect(trainStatusProvider.getStatuses).not.toHaveBeenCalled();
    expect(narrator.narrate).toHaveBeenCalledWith(expect.not.objectContaining({ commute: expect.anything() }));
  });
});
