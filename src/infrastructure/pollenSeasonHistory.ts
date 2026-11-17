import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { PollenSeasonHistory } from "../application/ports.js";

const validKey = (value: unknown): value is string => typeof value === "string" && /^tokyo:\d{4}:(?:cedar|cypress)$/.test(value);

export class FilePollenSeasonHistory implements PollenSeasonHistory {
  constructor(private readonly path = join(homedir(), ".local", "state", "ohayo-bot", "pollen-season-history.json")) {}

  async read(): Promise<string[]> {
    let raw: string;
    try { raw = await readFile(this.path, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new Error("花粉開始の案内履歴を読み込めませんでした。");
    }
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || !data.every(validKey)) throw new Error("花粉開始の案内履歴が不正です。");
    return [...new Set(data)].slice(-30);
  }

  async record(keys: readonly string[]): Promise<void> {
    if (!keys.every(validKey)) throw new Error("花粉開始の案内履歴が不正です。");
    const entries = [...new Set([...await this.read(), ...keys])].slice(-30);
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(entries), { mode: 0o600 });
      await rename(temporary, this.path);
    } finally { await rm(temporary, { force: true }); }
  }
}
