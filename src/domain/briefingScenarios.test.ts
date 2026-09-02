import { describe, expect, it } from "vitest";
import { briefingScenarioNames, getBriefingScenario } from "./briefingScenarios.js";

describe("briefing scenarios", () => {
  it("朝の原稿で確認したい代表パターンを持つ", () => {
    expect(briefingScenarioNames).toEqual([
      "rain",
      "rain-going-out",
      "rain-staying-home",
      "busy",
      "quiet",
      "hot",
      "cold",
      "sunny-uv",
      "windy",
      "all-day",
      "monday",
      "friday",
    ]);
  });

  it("雨の日は傘を案内する事実を含む", () => {
    expect(getBriefingScenario("rain").weather.umbrellaAdvice).toBeDefined();
  });

  it("雨の日でも外出の見込みで傘の案内を切り替えられる", () => {
    expect(getBriefingScenario("rain-going-out").weather.umbrellaAdvice).toBeDefined();
    expect(getBriefingScenario("rain-staying-home").weather.umbrellaAdvice).toBeUndefined();
  });

  it("予定が多い日は、読み上げる予定と残り件数を持つ", () => {
    expect(getBriefingScenario("busy").agenda).toMatchObject({ remainingCount: 3 });
    expect(getBriefingScenario("busy").agenda?.items).toHaveLength(3);
  });

  it("予定なし・季節情報・終日予定をそれぞれ表現できる", () => {
    expect(getBriefingScenario("quiet").agenda).toBeUndefined();
    expect(getBriefingScenario("hot").weather.highCelsius).toBe(35);
    expect(getBriefingScenario("hot").weather.seasonalAdvice).toHaveLength(2);
    expect(getBriefingScenario("cold").weather.seasonalAdvice).toEqual(["朝晩は体感的に冷えそうです。"]);
    expect(getBriefingScenario("sunny-uv").weather.seasonalAdvice).toEqual(["日差しが強そうです。"]);
    expect(getBriefingScenario("windy").weather.seasonalAdvice).toEqual(["風が強まりそうです。"]);
    expect(getBriefingScenario("all-day").agenda?.items[0]?.isAllDay).toBe(true);
  });

  it("月曜・金曜の先の予定を確認できる", () => {
    expect(getBriefingScenario("monday").weekdayFocus?.period).toBe("this-week");
    expect(getBriefingScenario("friday").weekdayFocus?.period).toBe("weekend-and-monday");
  });
});
