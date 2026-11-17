import { DateTime } from "luxon";

export type YellowDustNotice = { date: string; area: string };

// 地図の色や一般的なdust濃度を黄砂と読み替えず、当日を対象とする公式予報文だけ使う。
export function parseYellowDustNotice(data: unknown, date: string, timeZone: string, now: Date): YellowDustNotice | undefined {
  if (!data || typeof data !== "object") throw new Error("黄砂の情報形式が不正です。");
  const { reportDatetime, targetArea, text } = data as Record<string, unknown>;
  if (typeof reportDatetime !== "string" || typeof targetArea !== "string" || !targetArea.trim() ||
      targetArea.length > 60 || typeof text !== "string") throw new Error("黄砂の情報形式が不正です。");
  const issued = DateTime.fromISO(reportDatetime, { setZone: true });
  const current = DateTime.fromJSDate(now, { zone: timeZone });
  const target = DateTime.fromISO(date, { zone: timeZone });
  const age = current.diff(issued, "hours").hours;
  if (!issued.isValid || !target.isValid || current.toISODate() !== date || age < -5 / 60 || age > 18) {
    throw new Error("黄砂の情報が古い、または日付が不正です。");
  }
  const normalized = text.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const positive = normalized.split(/\n\s*\n/).some(paragraph => {
    // 今日と明日を混同しない。月をまたぐ予報も当日の「○日は」で選ぶ。
    if (!new RegExp(`^\\s*${target.day}日は[、,]`).test(paragraph)) return false;
    return paragraph.split(/[。\n]/).some(sentence => /黄砂/.test(sentence) &&
      /黄砂(?:が|の)飛来|黄砂が予想|黄砂に注意/.test(sentence) &&
      !/ない|なく|ません|否定/.test(sentence));
  });
  return positive ? { date, area: targetArea.trim() } : undefined;
}
