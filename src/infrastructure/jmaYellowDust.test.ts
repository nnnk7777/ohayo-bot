import { afterEach, expect, it, vi } from "vitest";
import { JmaYellowDustProvider } from "./jmaYellowDust.js";

afterEach(() => vi.unstubAllGlobals());

it("予報区の当日情報だけを取得し、失敗時の本文を外へ出さない", async () => {
  const provider = new JmaYellowDustProvider("000000", () => new Date("2026-04-01T07:00:00+09:00"));
  const today = { date: "2026-04-01", timeZone: "Asia/Tokyo" };
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    reportDatetime: "2026-04-01T05:00:00+09:00", targetArea: "サンプル県", text: "１日は、黄砂に注意してください。",
  }) });
  vi.stubGlobal("fetch", fetchMock);
  expect(await provider.getNotice(today)).toEqual({ date: today.date, area: "サンプル県" });
  expect(fetchMock.mock.calls[0][0]).toBe("https://www.jma.go.jp/bosai/forecast/data/overview_forecast/000000.json");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstream-private-body")));
  await expect(provider.getNotice(today)).rejects.toThrow(/^黄砂の気象情報を取得または解析できませんでした。$/);
});

it.each(["../other", "123", "000000?extra=value"])("任意URLや不正な予報区コードを受け付けない", code => {
  expect(() => new JmaYellowDustProvider(code)).toThrow();
});
