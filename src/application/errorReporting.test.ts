import { describe, expect, it, vi } from "vitest";
import { ErrorCollector, deliverErrorReport, settleValues } from "./errorReporting.js";
import type { ErrorReport } from "../domain/errorReport.js";
const base: ErrorReport = { id: "test", date: "2026-09-18", timeZone: "Asia/Tokyo", platform: "android", issues: [] };
describe("error reporting", () => {
  it("内部で復旧した処理は通知しない", async () => {
    const errors = new ErrorCollector();
    await errors.track("原稿生成", async () => { try { throw new Error("first attempt"); } catch { return "recovered"; } });
    const send = vi.fn();
    await deliverErrorReport({ ...base, issues: errors.issues }, send, vi.fn());
    expect(send).not.toHaveBeenCalled();
  });
  it("並列の失敗を最後まで収集して1通送る", async () => {
    const errors = new ErrorCollector();
    let finish!: () => void;
    const waiting = new Promise<void>(resolve => { finish = resolve; });
    const first = errors.track("天気", async () => { throw new Error("private payload"); });
    const second = errors.track("予定", async () => { await waiting; throw { status: 503, token: "secret" }; });
    const all = settleValues([first, second]);
    const rejected = expect(all).rejects.toThrow("private payload");
    finish();
    await rejected;
    const send = vi.fn();
    await deliverErrorReport({ ...base, issues: errors.issues }, send, vi.fn());
    expect(send).toHaveBeenCalledTimes(1);
    expect(errors.issues).toEqual([{ stage: "天気", code: "FAILED", fatal: true }, { stage: "予定", code: "HTTP_503", fatal: true }]);
    expect(JSON.stringify(errors.issues)).not.toMatch(/private|secret|token/);
  });
  it("部分失敗を集約し、送信と保存の失敗も呼び出し元へ投げない", async () => {
    const errors = new ErrorCollector();
    errors.record("電車", "FETCH_OR_PARSE_FAILED");
    errors.record("電車", "FETCH_OR_PARSE_FAILED");
    const save = vi.fn().mockRejectedValue(new Error("disk full"));
    await expect(deliverErrorReport({ ...base, issues: errors.issues }, vi.fn().mockRejectedValue(new Error("mail")), save)).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledOnce();
    expect(errors.issues).toHaveLength(1);
  });
});
