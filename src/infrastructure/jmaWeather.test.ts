import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JmaWeatherProvider } from "./jmaWeather.js";

const today = { date: "2026-10-07", time: "08:30", timeZone: "Asia/Tokyo" };
const provider = new JmaWeatherProvider("999000", "999010");
const target = { code: "999010", name: "架空の東部" };
const other = { code: "999020", name: "架空の西部" };
const report = {
  reportDatetime: "2026-10-07T05:00:00+09:00",
  timeSeries: [
    {
      timeDefines: ["2026-10-07T05:00:00+09:00", "2026-10-08T00:00:00+09:00"],
      areas: [{ area: other, weathers: ["晴れ", "晴れ"] }, { area: target, weathers: ["くもり　後　雨", "晴れ"] }],
    },
    {
      timeDefines: [0, 6, 12].map(hour => `2026-10-07T${String(hour).padStart(2, "0")}:00:00+09:00`)
        .concat("2026-10-08T00:00:00+09:00"),
      areas: [{ area: other, pops: ["80", "90", "90", "80"] }, { area: target, pops: ["90", "40", "20", "90"] }],
    },
  ],
};

function stubReport(data: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => data });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("JmaWeatherProvider", () => {
  beforeEach(() => vi.setSystemTime(new Date("2026-10-07T08:30:00+09:00")));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("対象区域の当日予報を使い、途中の6時間枠も判断に含める", async () => {
    const fetchMock = stubReport([report]);
    await expect(provider.getForecast(today)).resolves.toEqual({
      areaName: target.name, summary: "くもり 後 雨", hasUpcomingRainRisk: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.jma.go.jp/bosai/forecast/data/forecast/999000.json",
      expect.objectContaining({ signal: expect.any(AbortSignal), redirect: "error" }),
    );
  });

  it("終了した時間枠・翌日・別区域の降水確率を使わない", async () => {
    stubReport([report]);
    await expect(provider.getForecast({ ...today, time: "12:00" })).resolves.toMatchObject({ hasUpcomingRainRisk: false });
  });

  it.each(["2026-10-06T13:00:00+09:00", "2026-10-07T11:00:00+09:00"])("古い発表と未来の発表を拒否する", async reportDatetime => {
    stubReport([{ ...report, reportDatetime }]);
    await expect(provider.getForecast(today)).rejects.toThrow("有効な当日予報がありません");
  });

  it("対象区域が見つからない場合は別区域で代用しない", async () => {
    stubReport([report]);
    await expect(new JmaWeatherProvider("999000", "999030").getForecast(today)).rejects.toThrow("有効な当日予報がありません");
  });
});
