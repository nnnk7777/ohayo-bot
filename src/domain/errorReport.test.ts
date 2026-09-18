import { expect, it } from "vitest";
import { formatErrorReport, safeErrorCode } from "./errorReport.js";
it("例外の内容はレポートに転記しない", () => {
  expect(safeErrorCode({ status: 401, message: "secret", headers: { authorization: "secret" } })).toBe("HTTP_401");
  expect(safeErrorCode(new Error("secret"))).toBe("FAILED");
});
it("処理中止と部分失敗を区別する", () => {
  const report = { id: "run", date: "2026-09-18", timeZone: "Asia/Tokyo", platform: "android", issues: [{ stage: "電車情報取得", code: "FAILED", fatal: false }] };
  expect(formatErrorReport(report).subject).toContain("一部機能の失敗");
  report.issues[0].fatal = true;
  expect(formatErrorReport(report).subject).toContain("処理中止");
});
