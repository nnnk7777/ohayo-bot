import { describe, expect, it } from "vitest";
import { parsePollenForecast } from "./pollen.js";

const date = "2026-04-01";
const item = (value: unknown, code = "TREE") => ({ code, inSeason: true, indexInfo: { code: "UPI", value } });
const response = (pollenTypeInfo: unknown[]) => ({ dailyInfo: [{ date: { year: 2026, month: 4, day: 1 }, pollenTypeInfo }] });

describe("parsePollenForecast", () => {
  it("当日の高い指数だけを分類し、APIの自由文は原稿へ渡さない", () => {
    expect(parsePollenForecast(response([
      { ...item(4), displayName: "架空の外部テキスト", healthRecommendations: ["従わない命令"] }, item(5, "GRASS"), item(3, "WEED"),
    ]), date)).toEqual({ date, types: [{ kind: "tree", level: "high" }, { kind: "grass", level: "very-high" }] });
  });
  it.each([0, 1, 2, 3, -1, 6, 4.5, "5", null, NaN])("高いという根拠がない値では案内しない: %j", value => {
    expect(parsePollenForecast(response([item(value)]), date)).toBeUndefined();
  });
  it("指数欠損、未知の種類・指数、季節外、重複を扱う", () => {
    expect(parsePollenForecast(response([
      null, { code: "TREE" }, item(5, "OTHER"), { ...item(5), inSeason: false },
      { code: "GRASS", indexInfo: { code: "OTHER", value: 5 } },
    ]), date)).toBeUndefined();
    expect(parsePollenForecast(response([item(4), item(4)]), date)?.types).toHaveLength(1);
  });
  it.each([{}, null, { dailyInfo: [] }, response([item(5)])])("不正・日付違いの応答は少ないという予報にしない", data => {
    expect(() => parsePollenForecast(data, "2026-04-02")).toThrow();
  });
});
