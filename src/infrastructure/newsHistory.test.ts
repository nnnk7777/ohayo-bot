import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileNewsHistory } from "./newsHistory.js";

const directories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "ohayo-news-history-"));
  directories.push(directory);
  const path = join(directory, "history.json");
  return { path, history: new FileNewsHistory(path) };
}
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe("紹介済みニュースの保存", () => {
  it("初回は空で、見出しとURLだけを再起動後も読み出せる", async () => {
    const { path, history } = await fixture();
    expect(await history.read()).toEqual([]);
    const item = { title: "イベントA", url: "https://example.com/event", weather: "天気", schedules: ["予定"] };
    await history.record(item);
    expect(await new FileNewsHistory(path).read()).toEqual([{ title: item.title, url: item.url }]);
    const raw = await readFile(path, "utf8");
    expect(raw).not.toContain("天気");
    expect(raw).not.toContain("予定");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
  it("追跡パラメータ違いの同じ記事を重複保存しない", async () => {
    const { history } = await fixture();
    await history.record({ title: "イベントA", url: "https://example.com/event?utm_source=mail" });
    await history.record({ title: "イベントA", url: "https://example.com/event" });
    expect(await history.read()).toHaveLength(1);
  });
  it("壊れた履歴を空として扱わず、上書きもしない", async () => {
    const { path, history } = await fixture();
    await writeFile(path, "broken");
    await expect(history.read()).rejects.toThrow();
    await expect(history.record({ title: "新しい記事", url: "https://example.com/news" })).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe("broken");
  });
});
