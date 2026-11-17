import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { FilePollenSeasonHistory } from "./pollenSeasonHistory.js";

const directories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "ohayo-pollen-season-test-"));
  directories.push(directory);
  const path = join(directory, "history.json");
  return { path, history: new FilePollenSeasonHistory(path) };
}
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

it("種類と年だけを重複なく、権限制限したファイルへ永続化する", async () => {
  const { path, history } = await fixture();
  expect(await history.read()).toEqual([]);
  await history.record(["tokyo:2030:cedar"]);
  await history.record(["tokyo:2030:cedar", "tokyo:2030:cypress", "tokyo:2031:cedar"]);
  expect(await new FilePollenSeasonHistory(path).read()).toEqual(["tokyo:2030:cedar", "tokyo:2030:cypress", "tokyo:2031:cedar"]);
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  expect(await readFile(path, "utf8")).not.toContain("announcement");
});

it("破損した履歴は空として扱わず上書きもしない", async () => {
  const { path, history } = await fixture();
  await writeFile(path, "broken");
  await expect(history.read()).rejects.toThrow();
  await expect(history.record(["tokyo:2030:cedar"])).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe("broken");
});

it("履歴へ自由文や予定を保存しない", async () => {
  const { history } = await fixture();
  await expect(history.record(["private-fixture"])).rejects.toThrow();
});
