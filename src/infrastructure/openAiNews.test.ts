import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiNewsProvider } from "./openAiNews.js";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create }; } }));
const today = { date: "2026-10-13", timeZone: "Asia/Tokyo" };
const item = { title: "作品Aの発表", summary: "作品Aが発表されました。", reason: "ゲームに関連するため。",
  announcement: "作品Aが発表されました。", publishedDate: today.date, url: "https://example.com/news" };
const provider = () => new OpenAiNewsProvider("test-key", { model: "test-model", interests: [{ topic: "ゲーム", weight: 3 }] });
const response = (value: unknown, urls = [item.url]) => ({
  status: "completed", output_text: JSON.stringify({ item: value }),
  output: [{ type: "web_search_call", action: { type: "search", sources: urls.map(url => ({ type: "url", url })) } }],
});

beforeEach(() => create.mockReset());
describe("検索結果からのニュース選定", () => {
  it("検索で確認されたURLの単一記事を返し、検索には日付と興味分野だけを渡す", async () => {
    create.mockResolvedValue(response(item));
    expect(await provider().getNews(today)).toEqual(item);
    const [request, options] = create.mock.calls[0];
    expect(JSON.parse(request.input)).toEqual({ date: today.date, interests: [{ topic: "ゲーム", weight: 3 }], localAreas: [], excludedTopics: [], introduced: [] });
    expect(request.tool_choice).toBe("required");
    expect(request.store).toBe(false);
    expect(options.timeout).toBe(20_000);
  });
  it("良い話題がない結果はそのまま省略する", async () => {
    create.mockResolvedValue(response(null, []));
    expect(await provider().getNews(today)).toBeUndefined();
  });
  it("地域設定を検索の事実入力へ渡す", async () => {
    create.mockResolvedValue(response(null, []));
    const local = new OpenAiNewsProvider("test-key", { model: "test-model", interests: [], localAreas: ["テスト地域"] });
    await local.getNews(today);
    expect(JSON.parse(create.mock.calls[0][0].input).localAreas).toEqual(["テスト地域"]);
  });
  it("具体的な好み・除外条件・紹介済みの記事を検索へ渡す", async () => {
    const interests = [{ topic: "作品Aのような世界観のインディーゲーム", weight: 3 }];
    const excludedTopics = ["大会結果"];
    const introduced = [{ url: item.url, title: item.title }];
    const custom = new OpenAiNewsProvider("test-key", { model: "test-model", interests, excludedTopics });
    create.mockResolvedValue(response(item));
    expect(await custom.getNews(today, introduced)).toBeUndefined();
    expect(JSON.parse(create.mock.calls[0][0].input)).toEqual({ date: today.date, interests, excludedTopics, introduced, localAreas: [] });
  });
  it("古いイベント告知でも開催前のものを採用する", async () => {
    const event = { ...item, publishedDate: "2026-09-20", eventStartDate: "2026-10-20", eventEndDate: "2026-10-21" };
    create.mockResolvedValue(response(event));
    expect(await provider().getNews(today)).toEqual(event);
  });
  it("検索で確認されていないURLを拒否する", async () => {
    create.mockResolvedValue(response(item, []));
    await expect(provider().getNews(today)).rejects.toThrow();
  });
  it("中断された応答と不正JSONを採用しない", async () => {
    create.mockResolvedValue({ ...response(item), status: "incomplete" });
    await expect(provider().getNews(today)).rejects.toThrow();
    create.mockResolvedValue({ ...response(item), output_text: "broken" });
    await expect(provider().getNews(today)).rejects.toThrow();
  });
});
