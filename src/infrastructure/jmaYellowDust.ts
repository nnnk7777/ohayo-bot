import type { Today, YellowDustProvider } from "../application/ports.js";
import { parseYellowDustNotice } from "../domain/yellowDust.js";

export class JmaYellowDustProvider implements YellowDustProvider {
  constructor(private readonly areaCode: string, private readonly now: () => Date = () => new Date()) {
    if (!/^\d{6}$/.test(areaCode)) throw new Error("黄砂の予報区コードは6桁の数字にしてください。");
  }

  async getNotice(today: Today) {
    try {
      const response = await fetch(`https://www.jma.go.jp/bosai/forecast/data/overview_forecast/${this.areaCode}.json`, {
        signal: AbortSignal.timeout(8_000), redirect: "error",
      });
      if (!response.ok) throw new Error("黄砂の気象情報を取得できませんでした。");
      return parseYellowDustNotice(await response.json(), today.date, today.timeZone, this.now());
    } catch {
      throw new Error("黄砂の気象情報を取得または解析できませんでした。");
    }
  }
}
