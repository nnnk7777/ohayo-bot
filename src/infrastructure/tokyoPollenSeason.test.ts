import { afterEach, expect, it, vi } from "vitest";
import { TokyoPollenSeasonProvider } from "./tokyoPollenSeason.js";

afterEach(() => vi.unstubAllGlobals());
const today = { date: "2030-02-18", timeZone: "Asia/Tokyo" };
const listing = `<a href="2030021801.html">都内でスギ花粉の飛散開始（速報）</a>`;
const page = `<title>都内でスギ花粉の飛散開始（速報）</title><article>
<p class="date">公開日：令和12年2月18日</p><div id="contentsBody">
<p>東京都は、2月17日を都の観測地点で最も早いスギ花粉の飛散開始日として確認しました。</p></div></article>`;

it("公開一覧から個別記事を取得し、同じ年・種類の紹介済み記事を除外する", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, text: async () => listing }).mockResolvedValueOnce({ ok: true, text: async () => page });
  vi.stubGlobal("fetch", fetchMock);
  const provider = new TokyoPollenSeasonProvider();
  expect((await provider.getNotices(today, []))[0].key).toBe("tokyo:2030:cedar");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][1].signal).toBe(fetchMock.mock.calls[1][1].signal);
  expect(fetchMock.mock.calls[1][1].redirect).toBe("error");
  fetchMock.mockResolvedValueOnce({ ok: true, text: async () => listing }).mockResolvedValueOnce({ ok: true, text: async () => page });
  expect(await provider.getNotices(today, ["tokyo:2030:cedar"])).toEqual([]);
});

it("今期の新しい開始発表がなければ一覧だけで終了する", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => listing });
  vi.stubGlobal("fetch", fetchMock);
  expect(await new TokyoPollenSeasonProvider().getNotices({ ...today, date: "2030-10-30" }, [])).toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("取得失敗時の生のエラー本文を外へ出さない", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fixture-private-error")));
  await expect(new TokyoPollenSeasonProvider().getNotices(today, [])).rejects.toThrow(/^花粉開始発表を取得または解析できませんでした。$/);
});
