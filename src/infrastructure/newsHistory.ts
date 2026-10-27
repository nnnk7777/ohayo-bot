import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { NewsHistory } from "../application/ports.js";
import { newsUrlKey, type IntroducedNews } from "../domain/morningNews.js";

export class FileNewsHistory implements NewsHistory {
  constructor(private readonly path = join(homedir(), ".local", "state", "ohayo-bot", "news-history.json")) {}

  async read(): Promise<IntroducedNews[]> {
    let raw: string;
    try { raw = await readFile(this.path, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.some(item => !item || typeof item.url !== "string" || typeof item.title !== "string" ||
      !item.title.trim() || [...item.title].length > 160 || !/^https?:$/.test(new URL(item.url).protocol))) {
      throw new Error("ニュース紹介履歴の形式が不正です。");
    }
    return value.slice(-200).map(item => ({ url: item.url, title: item.title }));
  }

  async record(item: IntroducedNews): Promise<void> {
    const existing = await this.read();
    const entries = [...existing.filter(previous => newsUrlKey(previous.url) !== newsUrlKey(item.url)),
      { url: item.url, title: item.title }].slice(-200);
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(entries), { mode: 0o600 });
      await rename(temporary, this.path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
