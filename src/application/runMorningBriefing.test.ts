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
    const narrator = {
      narrate: vi.fn().mockResolvedValue("おはようございます。"),
    };
    const speaker = { speak: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const briefing = await runMorningBriefing(
      { scheduleProvider, weatherProvider, narrator, speaker },
      { today, speak: true },
    );

    expect(briefing).toBe("おはようございます。");
    expect(narrator.narrate).toHaveBeenCalledWith(expect.objectContaining({ date: today.date }));
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
        narrator: { narrate: vi.fn().mockResolvedValue("原稿です。") },
        speaker,
      },
      { today, speak: false },
    );

    expect(speaker.speak).not.toHaveBeenCalled();
  });
});
