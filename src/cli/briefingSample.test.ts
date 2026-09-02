import { describe, expect, it } from "vitest";
import { parseArgs, parseScenarioSelection } from "./briefingSample.js";

describe("briefing sample CLI", () => {
  it("対話モードを受け付ける", () => {
    expect(parseArgs(["--interactive"])).toEqual({
      scenarios: [],
      speak: false,
      list: false,
      interactive: true,
      combine: false,
    });
  });

  it("番号で複数のシナリオを選び、重複を除く", () => {
    expect(parseScenarioSelection("1, 3, 1")).toEqual(["rain", "rain-staying-home"]);
  });

  it("allは組み合わせとして不自然なため拒否する", () => {
    expect(() => parseScenarioSelection("all")).toThrow("対話モードでは all は使えません");
  });

  it("範囲外の番号を拒否する", () => {
    expect(() => parseScenarioSelection("13")).toThrow("シナリオ番号は 1〜12");
  });
});
