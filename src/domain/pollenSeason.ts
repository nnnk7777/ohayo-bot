import { DateTime } from "luxon";

export const tokyoPollenNoticesUrl = "https://www.hokeniryo1.metro.tokyo.lg.jp/allergy/info/index.html";
export type PollenSeasonNotice = {
  key: string;
  plant: "cedar" | "cypress";
  publishedDate: string;
  startDate: string;
  sourceUrl: string;
  announcement: string;
};

export function freshPollenPublication(publishedDate: string, today: string): boolean {
  const published = DateTime.fromISO(publishedDate, { zone: "Asia/Tokyo" });
  const current = DateTime.fromISO(today, { zone: "Asia/Tokyo" });
  const age = current.diff(published, "days").days;
  return published.isValid && current.isValid && published.year === current.year && age >= 0 && age <= 7;
}

export function pollenSeasonCandidates(html: string, today: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = plainText(match[2]);
    if (!/都内.*(?:スギ|ヒノキ)花粉.*飛散開始/.test(title) || /予測|予想|訂正|変更|取り消し/.test(title)) continue;
    const url = new URL(match[1], tokyoPollenNoticesUrl);
    if (url.origin !== new URL(tokyoPollenNoticesUrl).origin || url.search || url.hash) continue;
    const path = url.pathname.match(/^\/allergy\/info\/(\d{4})(\d{2})(\d{2})\d{2}\.html$/);
    // URLの日付は候補を絞るためだけに使い、発表日の確定は記事本文で行う。
    if (!path || !freshPollenPublication(`${path[1]}-${path[2]}-${path[3]}`, today)) continue;
    if (!urls.includes(url.href)) urls.push(url.href);
  }
  return urls.slice(0, 4);
}

export function parsePollenSeasonNotice(html: string, sourceUrl: string, today: string): PollenSeasonNotice | undefined {
  const title = plainText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  if (!/都内.*(?:スギ|ヒノキ)花粉.*飛散開始/.test(title) || /予測|予想|訂正|変更|取り消し/.test(title)) return undefined;
  const dateText = plainText(html.match(/<p\b[^>]*class=["']date["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
  const publication = dateText.match(/公開日\s*[:：]\s*(令和\s*\d+|\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!publication) throw new Error("花粉開始発表の公開日を確認できませんでした。");
  const year = publication[1].startsWith("令和") ? Number(publication[1].replace(/\D/g, "")) + 2018 : Number(publication[1]);
  const published = DateTime.fromObject({ year, month: Number(publication[2]), day: Number(publication[3]) }, { zone: "Asia/Tokyo" });
  if (!published.isValid || !freshPollenPublication(published.toISODate()!, today)) return undefined;
  const body = html.match(/<div\b[^>]*id=["']contentsBody["'][^>]*>([\s\S]*?)(?:<p\b[^>]*class=["']kanri["']|<\/article>)/i)?.[1];
  if (!body) throw new Error("花粉開始発表の本文を確認できませんでした。");
  const text = plainText(body);
  const start = text.match(/東京都は、\s*(\d{1,2})月\s*(\d{1,2})日[^。]{0,80}?を都の観測地点で最も早い(スギ|ヒノキ)花粉の飛散開始日として確認しました/);
  if (!start) throw new Error("花粉の観測に基づく開始日を確認できませんでした。");
  const startDate = DateTime.fromObject({ year, month: Number(start[1]), day: Number(start[2]) }, { zone: "Asia/Tokyo" });
  if (!startDate.isValid || startDate > published || !freshPollenPublication(startDate.toISODate()!, today)) return undefined;
  const plant = start[3] === "スギ" ? "cedar" : "cypress";
  if (!title.includes(`${start[3]}花粉`)) return undefined;
  return {
    key: `tokyo:${year}:${plant}`, plant, publishedDate: published.toISODate()!, startDate: startDate.toISODate()!, sourceUrl,
    announcement: `東京都から、${startDate.month}月${startDate.day}日に都内で${start[3]}花粉の飛散開始が確認されたと発表されています。`,
  };
}

function plainText(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, "")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&")
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\s+/g, " ").trim();
}
