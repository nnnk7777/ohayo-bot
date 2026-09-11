import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DateTime } from "luxon";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupExpiredDiagnosticDirectories, resolvePlaybackTime } from "./speech.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
  }));
});

describe("resolvePlaybackTime", () => {
  it("指定時刻より前なら同日の再生時刻を返す", () => {
    const now = DateTime.fromISO("2026-09-09T08:28:00", { zone: "Asia/Tokyo" });
    expect(resolvePlaybackTime("08:30", "Asia/Tokyo", now.toMillis()))
      .toBe(DateTime.fromISO("2026-09-09T08:30:00", { zone: "Asia/Tokyo" }).toMillis());
  });

  it("指定時刻を過ぎていれば待機しない", () => {
    const now = DateTime.fromISO("2026-09-09T08:30:01", { zone: "Asia/Tokyo" });
    expect(resolvePlaybackTime("08:30", "Asia/Tokyo", now.toMillis())).toBeUndefined();
  });

  it("再生時刻が未設定なら待機しない", () => {
    expect(resolvePlaybackTime(undefined, "Asia/Tokyo", Date.now())).toBeUndefined();
  });
});

describe("cleanupExpiredDiagnosticDirectories", () => {
  it("保持期限を過ぎた実行ディレクトリだけを削除する", async () => {
    const root = await mkdtemp(join(tmpdir(), "ohayo-bot-tts-test-"));
    temporaryDirectories.push(root);
    const expired = join(root, "expired");
    const current = join(root, "current");
    await mkdir(expired);
    await mkdir(current);
    await writeFile(join(root, "keep.txt"), "diagnostic root file");
    await utimes(expired, new Date(1_000), new Date(1_000));
    await utimes(current, new Date(3_000), new Date(3_000));

    await cleanupExpiredDiagnosticDirectories(root, 2_000);

    expect((await readdir(root)).sort()).toEqual(["current", "keep.txt"]);
  });
});
