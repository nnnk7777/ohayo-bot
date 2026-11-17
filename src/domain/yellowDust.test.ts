import { describe, expect, it } from "vitest";
import { parseYellowDustNotice } from "./yellowDust.js";

const date = "2026-04-01";
const now = new Date("2026-04-01T07:00:00+09:00");
const response = (text: string) => ({ reportDatetime: "2026-04-01T05:00:00+09:00", targetArea: "サンプル県", text });
const parse = (text: string) => parseYellowDustNotice(response(text), date, "Asia/Tokyo", now);

describe("parseYellowDustNotice", () => {
  it("当日の明示的な予報だけを、原文を渡さず地域の注意にする", () => {
    expect(parse("１日は、晴れるでしょう。黄砂の飛来が予想されます。\n\n２日は、曇りでしょう。")).toEqual({ date, area: "サンプル県" });
  });
  it.each([
    "２日は、黄砂の飛来が予想されます。", "１日は、黄砂の飛来はありません。",
    "１日は、黄砂の飛来は予想されません。", "黄砂に関する一般的な説明です。",
    "３１日は、黄砂に注意してください。", "１日は、晴れるでしょう。\n\n２日は、黄砂に注意してください。",
  ])("否定・一般論・別の日を当日の予報にしない: %s", text => expect(parse(text)).toBeUndefined());
  it.each(["2026-03-30T05:00:00+09:00", "2026-04-02T05:00:00+09:00", "invalid"])("古い・未来・不正な発表時刻は拒否する", reportDatetime => {
    expect(() => parseYellowDustNotice({ ...response("１日は、黄砂に注意してください。"), reportDatetime }, date, "Asia/Tokyo", now)).toThrow();
  });
  it("別の日に保存された応答を再利用しない", () => {
    expect(() => parseYellowDustNotice(response("１日は、黄砂に注意してください。"), date, "Asia/Tokyo", new Date("2026-04-02T07:00:00+09:00"))).toThrow();
  });
});
