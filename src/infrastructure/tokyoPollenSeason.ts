import type { PollenSeasonProvider, Today } from "../application/ports.js";
import { parsePollenSeasonNotice, pollenSeasonCandidates, tokyoPollenNoticesUrl, type PollenSeasonNotice } from "../domain/pollenSeason.js";

export class TokyoPollenSeasonProvider implements PollenSeasonProvider {
  async getNotices(today: Today, introduced: readonly string[]): Promise<PollenSeasonNotice[]> {
    // 一覧・個別記事を合わせて8秒。外部リンクや転送先へは移動しない。
    const signal = AbortSignal.timeout(8_000);
    const read = async (url: string) => {
      const response = await fetch(url, { signal, redirect: "error" });
      if (!response.ok) throw new Error("花粉開始発表を取得できませんでした。");
      return response.text();
    };
    try {
      const candidates = pollenSeasonCandidates(await read(tokyoPollenNoticesUrl), today.date);
      const notices: PollenSeasonNotice[] = [];
      for (const url of candidates) {
        const notice = parsePollenSeasonNotice(await read(url), url, today.date);
        if (notice && !introduced.includes(notice.key) && !notices.some(item => item.key === notice.key)) notices.push(notice);
      }
      return notices;
    } catch {
      throw new Error("花粉開始発表を取得または解析できませんでした。");
    }
  }
}
