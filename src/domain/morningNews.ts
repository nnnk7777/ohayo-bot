import { DateTime } from "luxon";
import type { MorningBriefingPlan } from "./morningBriefing.js";

export type NewsItem = {
  title: string;
  summary: string;
  reason: string;
  url: string;
  publishedDate: string;
  announcement: string;
  eventEndDate?: string;
  eventStartDate?: string;
};

export type NewsPreferences = {
  localAreas: readonly string[];
  interests?: readonly { topic: string; weight: number }[];
  excludedTopics?: readonly string[];
};

export type IntroducedNews = { url: string; title: string };

export function newsUrlKey(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || /^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

// 忙しい朝は元の案内を優先する。ニュースは単一オブジェクトだけを扱う。
export function canIncludeMorningNews(plan: MorningBriefingPlan): boolean {
  return plan.targetDurationSeconds <= 45 && !plan.commute;
}

export function validateNewsItem(value: unknown, sourceUrls: string[], date: string, introduced: readonly IntroducedNews[] = []): NewsItem | undefined {
  if (value === null) return undefined;
  if (!value || typeof value !== "object") throw new Error("ニュースの形式が不正です。");
  const record = value as Record<string, unknown>;
  const limits = { title: 160, summary: 600, reason: 200, url: 2048, publishedDate: 10, announcement: 80 };
  const fields = Object.entries(limits).map(([key, max]) => {
    const text = record[key];
    if (typeof text !== "string" || !text.trim() || [...text.trim()].length > max || /[\r\n\u0000-\u001f]/.test(text)) {
      throw new Error("ニュースの内容が不正です。");
    }
    return [key, text.trim()];
  });
  const item = Object.fromEntries(fields) as NewsItem;
  const url = new URL(item.url);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || !sourceUrls.includes(item.url)) {
    throw new Error("検索結果で確認できない記事URLです。");
  }
  if (introduced.some(previous => newsUrlKey(previous.url) === newsUrlKey(item.url))) return undefined;
  const today = DateTime.fromISO(date, { zone: "UTC" });
  const published = DateTime.fromISO(item.publishedDate, { zone: "UTC" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.publishedDate) || !today.isValid || !published.isValid ||
      published > today) {
    throw new Error("記事の公開日が確認できないか、未来の日付です。");
  }
  if (record.eventEndDate !== null && record.eventEndDate !== undefined) {
    if (typeof record.eventEndDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.eventEndDate)) {
      throw new Error("イベントの開催終了日が不正です。");
    }
    const end = DateTime.fromISO(record.eventEndDate, { zone: "UTC" });
    if (!end.isValid || end < today) throw new Error("終了済みのイベントです。");
    if (typeof record.eventStartDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(record.eventStartDate)) {
      throw new Error("イベントの開催開始日が不正です。");
    }
    const start = DateTime.fromISO(record.eventStartDate, { zone: "UTC" });
    if (!start.isValid || start > end) throw new Error("イベントの開催期間が不正です。");
    item.eventStartDate = record.eventStartDate;
    item.eventEndDate = record.eventEndDate;
  } else {
    if (record.eventStartDate !== null && record.eventStartDate !== undefined) throw new Error("イベントの開催終了日がありません。");
    if (published < today.minus({ days: 3 })) throw new Error("古い一般ニュースです。");
  }
  return item;
}

export function newsMailContent(item: NewsItem): { subject: string; text: string } {
  // 予定・天気・朝の原稿を受け取らず、ニュースの項目だけから構築する。
  return {
    subject: `ohayo-bot ニュース：${item.title}`,
    text: [item.title, `公開日: ${item.publishedDate}`,
      ...(item.eventEndDate ? [`開催期間: ${item.eventStartDate}〜${item.eventEndDate}`] : []), "", "要約", item.summary, "", "選定理由", item.reason,
      "", "元記事", item.url].join("\n"),
  };
}
