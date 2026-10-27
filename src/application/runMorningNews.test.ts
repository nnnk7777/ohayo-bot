import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMorningBriefing } from "./runMorningBriefing.js";
import { ErrorCollector } from "./errorReporting.js";
import type { NewsHistory } from "./ports.js";

const today = { date: "2026-10-13", timeZone: "Asia/Tokyo" };
const item = { title: "作品Aの新作", summary: "作品Aの新作が発表されました。", reason: "映画に関連するため。",
  announcement: "作品Aの新作が発表されました。", publishedDate: today.date, url: "https://example.com/news" };
function dependencies() {
  return {
    errors: new ErrorCollector(),
    personalProfile: {
      dailyRoutine: { officeWeekdays: [], remoteWeekdays: [] },
      scheduleRules: { excludedTitles: [], excludedTitleFragments: [], exactTitleRules: [], prefixRules: [],
        suffixRules: [], personOnlyTitles: [] },
    },
    scheduleProvider: { getSchedules: vi.fn().mockResolvedValue([]) },
    weatherProvider: { getWeather: vi.fn().mockResolvedValue({
      condition: "clear", currentCelsius: 20, lowCelsius: 15, highCelsius: 25, rainProbability: 0,
    }) },
    holidayProvider: { isHoliday: vi.fn().mockResolvedValue(false) },
    narrator: { narrate: vi.fn<(plan: import("../domain/morningBriefing.js").MorningBriefingPlan) => Promise<string>>()
      .mockResolvedValue("おはようございます。テスト原稿です。") },
    speaker: { speak: vi.fn().mockResolvedValue(undefined) },
    news: { provider: { getNews: vi.fn().mockResolvedValue(item) }, mailer: { sendNews: vi.fn().mockResolvedValue(undefined) }, history: undefined as NewsHistory | undefined },
  };
}
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("朝の原稿とニュース", () => {
  it("音声には短い紹介だけ、メールにはニュース項目だけを1件渡す", async () => {
    const deps = dependencies();
    await runMorningBriefing(deps, { today, speak: true });
    expect(deps.news.provider.getNews).toHaveBeenCalledExactlyOnceWith(today);
    expect(deps.narrator.narrate).toHaveBeenCalledWith(expect.objectContaining({
      news: { announcement: item.announcement }, targetDurationSeconds: 30,
    }));
    expect(deps.narrator.narrate.mock.calls[0][0].news).not.toHaveProperty("summary");
    expect(deps.news.mailer.sendNews).toHaveBeenCalledExactlyOnceWith(item);
    expect(deps.speaker.speak).toHaveBeenCalledOnce();
  });
  it("良い話題がない日は、ニュース案内もメールも追加しない", async () => {
    const deps = dependencies();
    deps.news.provider.getNews.mockResolvedValue(undefined);
    await runMorningBriefing(deps, { today, speak: true });
    expect(deps.narrator.narrate.mock.calls[0][0]).not.toHaveProperty("news");
    expect(deps.news.mailer.sendNews).not.toHaveBeenCalled();
    expect(deps.speaker.speak).toHaveBeenCalledOnce();
  });
  it("予定が多い朝はニュース検索もメールも行わない", async () => {
    const deps = dependencies();
    deps.scheduleProvider.getSchedules.mockResolvedValue(Array.from({ length: 4 }, (_, index) => ({ title: `予定${index}`, isAllDay: true })));
    await runMorningBriefing(deps, { today, speak: true });
    expect(deps.news.provider.getNews).not.toHaveBeenCalled();
    expect(deps.news.mailer.sendNews).not.toHaveBeenCalled();
  });
  it("ニュース取得失敗は非致命的なエラーとして記録し、朝の案内を続ける", async () => {
    const deps = dependencies();
    deps.news.provider.getNews.mockRejectedValue(new Error("external error"));
    await runMorningBriefing(deps, { today, speak: true });
    expect(deps.errors.issues).toEqual([{ stage: "ニュース取得", code: "FAILED", fatal: false }]);
    expect(deps.narrator.narrate.mock.calls[0][0]).not.toHaveProperty("news");
    expect(deps.news.mailer.sendNews).not.toHaveBeenCalled();
    expect(deps.speaker.speak).toHaveBeenCalledOnce();
  });
  it("メール送信失敗でも音声案内を続ける", async () => {
    const deps = dependencies();
    deps.news.mailer.sendNews.mockRejectedValue({ status: 403 });
    await runMorningBriefing(deps, { today, speak: true });
    expect(deps.errors.issues).toEqual([{ stage: "ニュースメール送信", code: "HTTP_403", fatal: false }]);
    expect(deps.speaker.speak).toHaveBeenCalledOnce();
  });
  it("--no-speechではニュースを原稿に含めてもメールは送らない", async () => {
    const deps = dependencies();
    await runMorningBriefing(deps, { today, speak: false });
    expect(deps.narrator.narrate.mock.calls[0][0]).toHaveProperty("news");
    expect(deps.news.mailer.sendNews).not.toHaveBeenCalled();
    expect(deps.speaker.speak).not.toHaveBeenCalled();
  });
  it("原稿生成に失敗した実行ではニュースメールを送らない", async () => {
    const deps = dependencies();
    deps.narrator.narrate.mockResolvedValue("");
    await expect(runMorningBriefing(deps, { today, speak: true })).rejects.toThrow();
    expect(deps.news.mailer.sendNews).not.toHaveBeenCalled();
    expect(deps.speaker.speak).not.toHaveBeenCalled();
  });
  it("紹介済み記事を候補から外し、再生完了後に新しい記事を記録する", async () => {
    const deps = dependencies();
    const previous = [{ title: "以前の記事", url: "https://example.com/old" }];
    const history = { read: vi.fn().mockResolvedValue(previous), record: vi.fn().mockResolvedValue(undefined) };
    deps.news.history = history;
    await runMorningBriefing(deps, { today, speak: true });
    expect(deps.news.provider.getNews).toHaveBeenCalledExactlyOnceWith(today, previous);
    expect(history.record).toHaveBeenCalledExactlyOnceWith({ title: item.title, url: item.url });
    expect(history.record.mock.invocationCallOrder[0]).toBeGreaterThan(deps.speaker.speak.mock.invocationCallOrder[0]);
  });
  it.each([false, true])("プレビューや再生失敗を紹介済みとして記録しない: speak=%s", async speak => {
    const deps = dependencies();
    const history = { read: vi.fn().mockResolvedValue([]), record: vi.fn().mockResolvedValue(undefined) };
    deps.news.history = history;
    if (speak) {
      deps.speaker.speak.mockRejectedValue(new Error("再生失敗"));
      await expect(runMorningBriefing(deps, { today, speak })).rejects.toThrow();
    } else {
      await runMorningBriefing(deps, { today, speak });
    }
    expect(history.record).not.toHaveBeenCalled();
  });
  it("紹介履歴が読めない場合はニュースを省き、予定と天気の案内を続ける", async () => {
    const deps = dependencies();
    deps.news.history = { read: vi.fn().mockRejectedValue(new Error("読込失敗")), record: vi.fn() };
    await runMorningBriefing(deps, { today, speak: true });
    expect(deps.news.provider.getNews).not.toHaveBeenCalled();
    expect(deps.speaker.speak).toHaveBeenCalledOnce();
  });
  it("履歴保存失敗は非致命的なエラーとして記録する", async () => {
    const deps = dependencies();
    deps.news.history = { read: vi.fn().mockResolvedValue([]), record: vi.fn().mockRejectedValue(new Error("保存失敗")) };
    await runMorningBriefing(deps, { today, speak: true });
    expect(deps.errors.issues).toEqual([{ stage: "ニュース履歴保存", code: "FAILED", fatal: false }]);
  });
});
