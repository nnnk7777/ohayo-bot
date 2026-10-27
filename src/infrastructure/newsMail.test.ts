import { describe, expect, it } from "vitest";
import { buildNewsMessage } from "./newsMail.js";

const item = { title: "テスト作品の新作", summary: "新作が発表されました。", reason: "映画に関連するため。",
  announcement: "テスト作品の新作が発表されました。", publishedDate: "2026-10-13", url: "https://example.com/news" };
const addresses = { from: "朝の案内 <me@example.com>", to: "me+news@example.com" };

describe("ニュースメール", () => {
  it("日本語見出し・表示名をエンコードし、ニュース詳細だけを送る", () => {
    const raw = buildNewsMessage(item, addresses);
    expect(raw).toContain("From: =?UTF-8?B?");
    expect(raw).toContain(`Subject: =?UTF-8?B?${Buffer.from(`ohayo-bot ニュース：${item.title}`).toString("base64")}?=`);
    const text = Buffer.from(raw.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString();
    expect(text).toContain(item.title);
    expect(text).toContain(item.summary);
    expect(text).toContain(item.reason);
    expect(text).toContain(item.url);
  });
  it.each(["", "me@example.com\r\nBcc: other@example.com"])("不正な宛先を拒否する: %j", to => {
    expect(() => buildNewsMessage(item, { ...addresses, to })).toThrow();
  });
});
