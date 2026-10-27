import { google } from "googleapis";
import type { NewsMailer } from "../application/ports.js";
import { newsMailContent, type NewsItem } from "../domain/morningNews.js";
import { getAuthorizedClient } from "./googleCalendar.js";
import { mailConfig } from "./errorReportMail.js";

export class GmailNewsMailer implements NewsMailer {
  async sendNews(item: NewsItem): Promise<void> {
    const auth = await getAuthorizedClient(mailConfig());
    auth.transporter.defaults.timeout = 15_000;
    auth.transporter.defaults.retryConfig = { retry: 0 };
    const message = buildNewsMessage(item, {
      from: process.env.ERROR_REPORT_EMAIL_FROM ?? "",
      to: process.env.NEWS_EMAIL_TO ?? process.env.ERROR_REPORT_EMAIL_TO ?? "",
    });
    await google.gmail({ version: "v1", auth }).users.messages.send({
      userId: "me", requestBody: { raw: Buffer.from(message).toString("base64url") },
    }, { timeout: 15_000, retry: false, retryConfig: { retry: 0 } });
  }
}

export function buildNewsMessage(item: NewsItem, addresses: { from: string; to: string }): string {
  if (Object.values(addresses).some(value => !value.trim() || /[\r\n]/.test(value))) {
    throw new Error("ニュースメールの宛先設定が不正です。");
  }
  const { subject, text } = newsMailContent(item);
  const encode = (value: string) => `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
  const address = (value: string) => {
    const match = value.trim().match(/^(.+?)\s*<([^<>]+)>$/);
    return match ? `${encode(match[1].trim())} <${match[2]}>` : value.trim();
  };
  return [`From: ${address(addresses.from)}`, `To: ${address(addresses.to)}`, `Subject: ${encode(subject)}`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
    Buffer.from(text).toString("base64").match(/.{1,76}/g)!.join("\r\n")].join("\r\n");
}
