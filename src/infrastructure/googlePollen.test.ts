import { afterEach, describe, expect, it, vi } from "vitest";
import { GooglePollenProvider } from "./googlePollen.js";

afterEach(() => vi.unstubAllGlobals());
const today = { date: "2026-04-01", timeZone: "Asia/Tokyo" };
const provider = () => new GooglePollenProvider("fixture-key", { latitude: 0, longitude: 0 });

describe("GooglePollenProvider", () => {
  it("座標と当日1日分を取得し、キーをURLへ含めない", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ dailyInfo: [{
      date: { year: 2026, month: 4, day: 1 }, pollenTypeInfo: [{ code: "TREE", indexInfo: { code: "UPI", value: 5 } }],
    }] }) });
    vi.stubGlobal("fetch", fetchMock);
    expect((await provider().getForecast(today))?.types).toEqual([{ kind: "tree", level: "very-high" }]);
    const [url, init] = fetchMock.mock.calls[0];
    const params = new URL(url).searchParams;
    expect(params.get("days")).toBe("1");
    expect(params.get("location.latitude")).toBe("0");
    expect(params.get("plantsDescription")).toBe("false");
    expect(url).not.toContain("fixture-key");
    expect(init.headers["X-Goog-Api-Key"]).toBe("fixture-key");
    expect(init.redirect).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("通信失敗の生エラーや応答本文を外へ出さない", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fixture-key upstream-body")));
    await expect(provider().getForecast(today)).rejects.toThrow(/^花粉予報を取得または解析できませんでした。$/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, text: () => { throw new Error("read-error-body"); } }));
    await expect(provider().getForecast(today)).rejects.toThrow(/^花粉予報を取得または解析できませんでした。$/);
  });
});
