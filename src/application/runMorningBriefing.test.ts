import { afterEach, describe, expect, it, vi } from "vitest";
import { runMorningBriefing } from "./runMorningBriefing.js";

const today = { date: "2026-09-01", timeZone: "Asia/Tokyo" };

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
      narrate: vi.fn().mockResolvedValue("おはようございます。"),
    };
    const speaker = { speak: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const briefing = await runMorningBriefing(
      { scheduleProvider, weatherProvider, holidayProvider, narrator, speaker },
      { today, locationName: "武蔵野市", speak: true },
    );

    expect(briefing).toBe("おはようございます。");
    expect(narrator.narrate).toHaveBeenCalledWith(expect.objectContaining({
      date: today.date,
      locationName: "武蔵野市",
    }));
    expect(speaker.speak).toHaveBeenCalledWith("おはようございます。");
  });

  it("--no-speech相当では読み上げない", async () => {
    const speaker = { speak: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runMorningBriefing(
      {
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
});
