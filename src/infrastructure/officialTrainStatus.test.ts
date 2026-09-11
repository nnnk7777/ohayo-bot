import { describe, expect, it, vi } from "vitest";
import { OfficialTrainStatusProvider, parseJrEastStatus, parseTokyoMetroStatus } from "./officialTrainStatus.js";

const jrSegment = {
  from: "三鷹",
  to: "四ツ谷",
  lineName: "中央線快速電車",
  source: { kind: "jr-east" as const, officialUrl: "https://example.com/jr" },
};
const metroSegment = {
  from: "四ツ谷",
  to: "溜池山王",
  lineName: "南北線",
  source: { kind: "tokyo-metro" as const, officialUrl: "https://example.com/metro", lineId: "namboku" },
};

describe("official train status parsers", () => {
  it("JR東日本の遅延情報と更新時刻を解析する", () => {
    const result = parseJrEastStatus(`
      <p>2026年9月9日 8時25分 現在</p>
      <section id="susp_service_info">
        <li class="traininfo-line-info__item">
          <p class="traininfo-line-info__status delay"><span>遅延</span>
            <div class="traininfo-line-info__note"><p>中央線快速電車は、一部列車に遅れがでています。</p></div>
          </p>
        </li>
        <!--運行情報更新履歴-->
      </section>
    `, "Asia/Tokyo");

    expect(result.state).toBe("disrupted");
    expect(result.detail).toBe("中央線快速電車は、一部列車に遅れがでています。");
    expect(result.checkedAt.toISO()).toBe("2026-09-09T08:25:00.000+09:00");
  });

  it("JR東日本の平常運転を解析する", () => {
    const result = parseJrEastStatus(`
      <p>2026年9月9日 8時26分 現在</p>
      <section id="susp_service_info">
        <p class="traininfo-line-info__status normal"><span>平常運転</span></p>
        <!--運行情報更新履歴-->
      </section>
    `, "Asia/Tokyo");

    expect(result.state).toBe("normal");
  });

  it("東京メトロ公式JSONから対象路線の現在の状態を解析する", () => {
    const result = parseTokyoMetroStatus(`operate_status_cb_func({
      "jp": { "lines": [
        { "name_alpha_db": "namboku", "status_icon": "chien", "status_info": "一部列車遅延", "contents": "南北線の一部列車に遅れが出ています。" }
      ] }
    });`, "namboku", "Asia/Tokyo", "Tue, 08 Sep 2026 23:27:00 GMT");

    expect(result.state).toBe("disrupted");
    expect(result.detail).toBe("南北線の一部列車に遅れが出ています。");
    expect(result.checkedAt.toISO()).toBe("2026-09-09T08:27:00.000+09:00");
  });
});

describe("OfficialTrainStatusProvider", () => {
  it("出社時点で新鮮な平常運転はnormalとして返す", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (name: string) => name === "date" ? "Tue, 08 Sep 2026 23:20:00 GMT" : null },
      text: async () => `operate_status_cb_func({"jp":{"lines":[
        {"name_alpha_db":"namboku","status_icon":"heijou","status_info":"平常運転","contents":"現在、平常どおり運転しています。"}
      ]}});`,
    });
    const provider = new OfficialTrainStatusProvider(
      [metroSegment],
      fetcher,
      () => new Date("2026-09-08T23:30:00.000Z"),
    );

    await expect(provider.getStatuses({ date: "2026-09-09", timeZone: "Asia/Tokyo" })).resolves.toEqual([
      expect.objectContaining({ lineName: "南北線", state: "normal" }),
    ]);
  });

  it("取得失敗と鮮度不足をunknownとして返す", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (name: string) => name === "date" ? "Tue, 08 Sep 2026 21:00:00 GMT" : null },
        text: async () => `operate_status_cb_func({"jp":{"lines":[
          {"name_alpha_db":"namboku","status_icon":"heijou","status_info":"平常運転","contents":"現在、平常どおり運転しています。"}
        ]}});`,
      });
    const provider = new OfficialTrainStatusProvider(
      [jrSegment, metroSegment],
      fetcher,
      () => new Date("2026-09-08T23:30:00.000Z"),
    );

    const statuses = await provider.getStatuses({ date: "2026-09-09", timeZone: "Asia/Tokyo" });

    expect(statuses.map((status) => status.state)).toEqual(["unknown", "unknown"]);
    expect(statuses[0]?.detail).toContain("取得できず");
    expect(statuses[1]?.detail).toContain("更新時刻が古い");
  });
});
