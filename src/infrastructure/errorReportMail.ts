import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { google } from "googleapis";
import { getAuthorizedClient } from "./googleCalendar.js";
import { formatErrorReport, type ErrorReport } from "../domain/errorReport.js";

export const mailScope = "https://www.googleapis.com/auth/gmail.send";
export function mailConfig() {
  const required = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value || /[\r\n]/.test(value)) throw new Error("メール通知設定が不足または不正です。");
    return value;
  };
  return { calendarId: "primary", credentialsPath: required("ERROR_REPORT_GOOGLE_CREDENTIALS_PATH"),
    tokenPath: required("ERROR_REPORT_GOOGLE_TOKEN_PATH") };
}
export async function sendErrorReport(report: ErrorReport): Promise<void> {
  const header = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value || /[\r\n]/.test(value)) throw new Error("メールヘッダー設定が不足または不正です。");
    return value;
  };
  const auth = await getAuthorizedClient(mailConfig());
  auth.transporter.defaults.timeout = 15_000;
  auth.transporter.defaults.retryConfig = { retry: 0 };
  const raw = buildReportMessage(report, {
    from: header("ERROR_REPORT_EMAIL_FROM"), to: header("ERROR_REPORT_EMAIL_TO"),
    replyTo: header("ERROR_REPORT_EMAIL_REPLY_TO"),
  });
  await google.gmail({ version: "v1", auth }).users.messages.send({ userId: "me", requestBody: {
    raw: Buffer.from(raw).toString("base64url"),
  } }, { retry: false, retryConfig: { retry: 0 }, timeout: 15_000 });
}

export function buildReportMessage(report: ErrorReport, addresses: { from: string; to: string; replyTo: string }): string {
  if (Object.values(addresses).some(value => /[\r\n]/.test(value))) throw new Error("不正なメールヘッダーです。");
  const { subject, text } = formatErrorReport(report);
  const encode = (value: string) => `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
  const address = (value: string): string => {
    const match = value.match(/^(.+?)\s*<([^<>]+)>$/);
    return match ? `${encode(match[1].trim())} <${match[2]}>` : value;
  };
  const html = `<pre>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;
  const boundary = "ohayo-report-parts";
  return [`From: ${address(addresses.from)}`, `To: ${address(addresses.to)}`,
    `Reply-To: ${address(addresses.replyTo)}`, `Subject: ${encode(subject)}`,
    `Message-ID: <${report.id}@ohayo-bot.local>`, "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    ...[["text/plain", text], ["text/html", html]].flatMap(([type, body]) =>
      [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "",
        Buffer.from(body).toString("base64").match(/.{1,76}/g)!.join("\r\n")]), `--${boundary}--`].join("\r\n");
}
export async function saveUnsentReport(report: ErrorReport): Promise<void> {
  const directory = join(homedir(), ".local", "state", "ohayo-bot", "error-reports");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, `${report.id}.json`), JSON.stringify({ ...report, mailDelivery: "failed" }), { mode: 0o600 });
}
