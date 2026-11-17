import { describe, expect, it } from "vitest";
import { freshPollenPublication, parsePollenSeasonNotice, pollenSeasonCandidates } from "./pollenSeason.js";

const today = "2030-02-18";
const url = "https://www.hokeniryo1.metro.tokyo.lg.jp/allergy/info/2030021801.html";
// 公開ページの構造だけを再現した架空の日付・発表。個人の地域設定は使用しない。
export const article = (plant = "スギ", publication = "令和12年2月18日", start = "2月17日") => `
<title>都内で${plant}花粉の飛散開始（速報）｜お知らせ</title>
<article><p class="date">最終更新日：令和12年2月18日 ｜ 公開日：${publication}</p>
<div id="contentsBody"><p>東京都は、${start}（日曜日）を都の観測地点で最も早い${plant}花粉の飛散開始日として確認しましたので、お知らせします。</p>
<a href="/unused">外部の説明</a></div></article>`;

describe("pollenSeason", () => {
  it("同年かつ直近7日以内の発表だけが新しい", () => {
    expect(freshPollenPublication("2030-02-11", today)).toBe(true);
    for (const date of ["2030-02-10", "2030-02-19", "2029-02-18", "invalid"]) expect(freshPollenPublication(date, today)).toBe(false);
  });
  it("同じ公式サイトの新しい開始発表だけを候補にし、予測や過去年を除外する", () => {
    const anchor = (href: string, title = "都内でスギ花粉の飛散開始（速報）") => `<a href="${href}">${title}</a>`;
    expect(pollenSeasonCandidates([
      anchor("2030021801.html"), anchor(url), anchor("2029021801.html"), anchor("2030020101.html"),
      anchor("2030021802.html", "スギ花粉の飛散開始予測"),
      anchor("https://example.com/allergy/info/2030021801.html"), anchor("/other/2030021801.html"),
    ].join(""), today)).toEqual([url]);
  });
  it.each([["スギ", "cedar"], ["ヒノキ", "cypress"]])("%sの開始を固定の事実だけに変換する", (name, plant) => {
    expect(parsePollenSeasonNotice(article(name), url, today)).toEqual({
      key: `tokyo:2030:${plant}`, plant, publishedDate: today, startDate: "2030-02-17", sourceUrl: url,
      announcement: `東京都から、2月17日に都内で${name}花粉の飛散開始が確認されたと発表されています。`,
    });
  });
  it("記事のURLや最終更新日を公開日として扱わない", () => {
    expect(parsePollenSeasonNotice(article("スギ", "令和11年2月18日"), url, today)).toBeUndefined();
    expect(parsePollenSeasonNotice(article("スギ", "2030年2月18日"), url, today)?.publishedDate).toBe(today);
  });
  it.each(["2月19日", "2月30日", "2月1日"])("未来・不正・古い開始日は案内しない: %s", start => {
    expect(parsePollenSeasonNotice(article("スギ", "令和12年2月18日", start), url, today)).toBeUndefined();
  });
  it("予測・未確認・構造変更を開始確認にしない", () => {
    expect(parsePollenSeasonNotice(article().replace("（速報）", "予測"), url, today)).toBeUndefined();
    expect(() => parsePollenSeasonNotice(article().replace("確認しました", "確認していません"), url, today)).toThrow();
    expect(() => parsePollenSeasonNotice(article().replace('id="contentsBody"', 'id="changed"'), url, today)).toThrow();
    expect(() => parsePollenSeasonNotice(article().replace("公開日：", "掲載："), url, today)).toThrow();
  });
});
