import { describe, expect, it } from "vitest";
import { briefingScenarioNames, getBriefingScenario } from "./briefingScenarios.js";

describe("briefing scenarios", () => {
  it("朝の原稿で確認したい代表パターンを持つ", () => {
    expect(briefingScenarioNames).toEqual(["rain", "busy", "quiet", "hot", "all-day"]);
  });

  it("雨の日は傘を案内する事実を含む", () => {
    expect(getBriefingScenario("rain").weather.umbrellaAdvice).toBeDefined();
  });

  it("予定が多い日は、読み上げる予定と残り件数を持つ", () => {
    expect(getBriefingScenario("busy").agenda).toMatchObject({ remainingCount: 3 });
    expect(getBriefingScenario("busy").agenda?.items).toHaveLength(3);
  });

  it("予定なし・暑さ・終日予定をそれぞれ表現できる", () => {
    expect(getBriefingScenario("quiet").agenda).toBeUndefined();
    expect(getBriefingScenario("hot").weather.highCelsius).toBe(35);
    expect(getBriefingScenario("all-day").agenda?.items[0]?.isAllDay).toBe(true);
  });
});
