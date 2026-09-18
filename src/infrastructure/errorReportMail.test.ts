import { describe, expect, it } from "vitest";
import { buildReportMessage } from "./errorReportMail.js";
const report = { id: "run", date: "2026-09-18T00:00:00Z", timeZone: "Asia/Tokyo", platform: "android", issues: [{ stage: "<script>", code: "FAILED", fatal: false }] };
const addresses = { from: "名前 <sender@example.com>", to: "receiver@example.com", replyTo: "sender@example.com" };
describe("メール形式", () => {
  it("表示名をエンコードしHTMLをエスケープする", () => {
    const message = buildReportMessage(report, addresses);
    expect(message).toContain("From: =?UTF-8?B?");
    const parts = message.split('Content-Transfer-Encoding: base64\r\n\r\n');
    const html = Buffer.from(parts[2].split("\r\n--")[0].replace(/\r\n/g, ""), "base64").toString();
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("9/18 09:00:00");
  });
  it("ヘッダーへの改行挿入を拒否する", () => {
    expect(() => buildReportMessage(report, { ...addresses, to: "receiver@example.com\r\nBcc: other@example.com" })).toThrow();
  });
});
