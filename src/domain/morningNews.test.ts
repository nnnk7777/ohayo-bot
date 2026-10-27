import { describe, expect, it } from "vitest";
import { canIncludeMorningNews, newsMailContent, validateNewsItem } from "./morningNews.js";
import { planMorningBriefing } from "./morningBriefing.js";

const item = {
  title: "架空バンドの新作発表", summary: "架空バンドが新しいアルバムを発表しました。",
  reason: "音楽の新作情報への関心に合うため。", url: "https://example.com/music/new-album",
  publishedDate: "2026-10-12", announcement: "架空バンドが新しいアルバムを発表しました。",
};

describe("朝のニュース", () => {
  it("話題なしは省略し、確認済みの最近の記事を1件扱う", () => {
    expect(validateNewsItem(null, [], "2026-10-13")).toBeUndefined();
    expect(validateNewsItem(item, [item.url], "2026-10-13")).toEqual(item);
  });

  it.each([
    { publishedDate: "2026-10-09" }, { publishedDate: "2026-10-14" },
    { publishedDate: "不明" }, { announcement: "あ".repeat(81) },
    { announcement: "見出し\n別の話題" }, { summary: "" },
    { url: "javascript:alert(1)" }, { url: "https://user:secret@example.com/news" },
  ])("不正または長すぎる記事を拒否する: %j", patch => {
    const value = { ...item, ...patch };
    expect(() => validateNewsItem(value, [value.url], "2026-10-13")).toThrow();
  });

  it("検索結果にないURLと複数記事の配列を拒否する", () => {
    expect(() => validateNewsItem(item, [], "2026-10-13")).toThrow();
    expect(() => validateNewsItem([item, item], [item.url], "2026-10-13")).toThrow();
  });
  it("公開日が新しくても終了済みイベントは拒否し、今日まで開催中なら採用する", () => {
    expect(() => validateNewsItem({ ...item, eventStartDate: "2026-10-01", eventEndDate: "2026-10-12" }, [item.url], "2026-10-13")).toThrow();
    expect(validateNewsItem({ ...item, eventStartDate: "2026-10-01", eventEndDate: "2026-10-13" }, [item.url], "2026-10-13"))
      .toHaveProperty("eventEndDate", "2026-10-13");
    expect(() => validateNewsItem({ ...item, eventEndDate: "2026-02-30" }, [item.url], "2026-10-13")).toThrow();
  });

  it("古い告知でも開催前・開催中なら採用し、開催期間が不明・逆転なら拒否する", () => {
    const event = { ...item, publishedDate: "2026-09-01", eventStartDate: "2026-10-20", eventEndDate: "2026-10-21" };
    expect(validateNewsItem(event, [item.url], "2026-10-13")).toEqual(event);
    expect(validateNewsItem({ ...event, eventStartDate: "2026-10-01" }, [item.url], "2026-10-13"))
      .toHaveProperty("eventStartDate", "2026-10-01");
    expect(() => validateNewsItem({ ...event, eventStartDate: undefined }, [item.url], "2026-10-13")).toThrow();
    expect(() => validateNewsItem({ ...event, eventStartDate: "2026-10-22" }, [item.url], "2026-10-13")).toThrow();
    expect(() => validateNewsItem({ ...event, eventEndDate: null }, [item.url], "2026-10-13")).toThrow();
  });

  it("紹介済み記事は追跡パラメータが違っても省略し、別記事は残す", () => {
    const introduced = [{ url: `${item.url}?utm_source=mail`, title: item.title }];
    expect(validateNewsItem(item, [item.url], "2026-10-13", introduced)).toBeUndefined();
    const another = { ...item, url: `${item.url}?id=2` };
    expect(validateNewsItem(another, [another.url], "2026-10-13", introduced)).toEqual(another);
  });

  it("メールにはニュースの見出し・要約・理由・URLだけを含める", () => {
    const content = newsMailContent({ ...item, weather: "晴れ", schedules: ["秘密の予定"] } as typeof item);
    expect(content.subject).toContain(item.title);
    for (const field of [item.title, item.summary, item.reason, item.url]) expect(content.text).toContain(field);
    expect(content.text).not.toContain("晴れ");
    expect(content.text).not.toContain("秘密の予定");
  });

  it("長い予定案内と運行情報がある朝はニュースを省く", () => {
    const base = planMorningBriefing({ date: "2026-10-13", schedules: [],
      weather: { condition: "clear", currentCelsius: 20, lowCelsius: 15, highCelsius: 25, rainProbability: 0 } });
    expect(canIncludeMorningNews(base)).toBe(true);
    expect(canIncludeMorningNews({ ...base, targetDurationSeconds: 70 })).toBe(false);
    expect(canIncludeMorningNews({ ...base, commute: { issues: [], guidance: "確認" } })).toBe(false);
  });
});
