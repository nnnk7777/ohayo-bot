import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatBriefingCheckError, generationFailureMessage, parseBriefingCheckArgs, runBriefingCheck } from "./briefingCheck.js";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(), mkdir: vi.fn(), mkdtemp: vi.fn(), writeFile: vi.fn(),
  construct: vi.fn(), narrate: vi.fn(), dotenv: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile, mkdir: mocks.mkdir, mkdtemp: mocks.mkdtemp, writeFile: mocks.writeFile }));
vi.mock("dotenv", () => ({ config: mocks.dotenv }));
vi.mock("../infrastructure/openAiNarrator.js", () => ({ OpenAiBriefingNarrator: class {
  constructor(...args: unknown[]) { mocks.construct(...args); }
  narrate = mocks.narrate;
} }));
const fixtureJson = readFileSync("scripts/fixtures/briefing-review-cases.json", "utf8");

describe("briefing check CLI", () => {
  it("既定では生成もローカルプロフィールの読み込みも行わない", () => {
    expect(parseBriefingCheckArgs([])).toMatchObject({ generate: false, localProfile: false });
  });
  it("明示した生成・ローカル補足・開催地・ケース選択を受け付ける", () => {
    expect(parseBriefingCheckArgs(["--", "--generate", "--local-profile", "--cooking-place=サンプル街", "--cases=mixed-usual,normalized-gym", "--output-dir=/tmp/review"]))
      .toEqual({ generate: true, localProfile: true, cookingPlace: "サンプル街", cases: ["mixed-usual", "normalized-gym"], outputDir: "/tmp/review" });
  });
  it.each([
    ["--speech"], ["--local-profile"], ["--cooking-place=サンプル街"],
    ["--generate", "--generate"], ["--output-dir="], ["--cases="],
  ])("不明・重複・不足した引数を拒否する: %j", (...args) => {
    expect(() => parseBriefingCheckArgs(args)).toThrow();
  });
});

describe("briefing check execution", () => {
  const previousExitCode = process.exitCode;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("OPENAI_API_KEY", "test-key-not-a-real-credential");
    mocks.readFile.mockResolvedValue(fixtureJson);
    mocks.mkdtemp.mockResolvedValue("/tmp/fictional-review");
    mocks.narrate.mockResolvedValue("15時にサンプル太郎さんとの予定があります。");
    process.exitCode = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.exitCode = previousExitCode;
  });

  it("一覧表示は設定やAPIを読み込まず、結果も書き込まない", async () => {
    await runBriefingCheck([]);
    expect(mocks.dotenv).not.toHaveBeenCalled();
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("22-pet-birthday"));
  });

  it.each([
    { args: ["--bad=private-input"], expected: "不明な引数" },
    { args: ["--cases=not-found"], expected: "存在しないケースID" },
  ])("引数の問題をAPI呼び出し前に説明する: $expected", async ({ args, expected }) => {
    let error: unknown;
    try { await runBriefingCheck(args); } catch (cause) { error = cause; }
    expect(formatBriefingCheckError(error)).toContain(expected);
    expect(formatBriefingCheckError(error)).not.toContain("private-input");
    expect(mocks.construct).not.toHaveBeenCalled();
  });

  it("APIキー不足を説明して生成しない", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(runBriefingCheck(["--generate"])).rejects.toThrow("OPENAI_API_KEYを設定");
    expect(mocks.construct).not.toHaveBeenCalled();
  });

  it.each([
    { code: "EEXIST", expected: "出力先が既に存在" },
    { code: "EACCES", expected: "親ディレクトリと書き込み権限" },
  ])("出力先の問題を生成前に説明する: $code", async ({ code, expected }) => {
    mocks.mkdir.mockRejectedValue(Object.assign(new Error("private path"), { code }));
    await expect(runBriefingCheck(["--generate", "--output-dir=/tmp/example"])).rejects.toThrow(expected);
    expect(mocks.construct).not.toHaveBeenCalled();
  });

  it("必要なケースだけ生成して結果を権限制限して保存する", async () => {
    await runBriefingCheck(["--generate", "--cases=01-person-unknown"]);
    expect(mocks.narrate).toHaveBeenCalledTimes(1);
    expect(mocks.writeFile).toHaveBeenCalledWith(expect.stringContaining("01-person-unknown.json"), expect.any(String), { mode: 0o600 });
    expect(mocks.writeFile).toHaveBeenCalledWith(expect.stringContaining("report.md"), expect.stringContaining("event-time"), { mode: 0o600 });
    expect(process.exitCode).toBe(0);
  });

  it("生成失敗の分類を保存し、生のエラー本文は出さず終了コード1にする", async () => {
    mocks.narrate.mockRejectedValue(Object.assign(new Error("private request and credential"), { status: 429 }));
    await runBriefingCheck(["--generate", "--cases=01-person-unknown"]);
    const saved = JSON.stringify(mocks.writeFile.mock.calls);
    expect(saved).toContain("利用上限・リクエスト制限");
    expect(saved).not.toContain("private request and credential");
    expect(process.exitCode).toBe(1);
  });

  it("結果保存とケース読み込みの失敗を区別する", async () => {
    mocks.readFile.mockRejectedValueOnce(new Error("private path"));
    await expect(runBriefingCheck([])).rejects.toThrow("確認ケースを読み込めません");
    mocks.writeFile.mockRejectedValue(new Error("private path"));
    await expect(runBriefingCheck(["--generate", "--cases=01-person-unknown"])).rejects.toThrow("確認結果を保存できません");
  });

  it("未知のエラーやAPIの生メッセージは表示しない", () => {
    expect(formatBriefingCheckError(new Error("private credential"))).not.toContain("private credential");
    for (const status of [401, 403, 429, 500, 503, undefined]) {
      expect(generationFailureMessage({ status, message: "private credential" })).not.toContain("private credential");
    }
    expect(generationFailureMessage({ status: 401 })).toContain("認証");
    expect(generationFailureMessage({ status: 503 })).toContain("OpenAI側");
  });
});
