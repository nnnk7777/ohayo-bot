import { randomUUID } from "node:crypto";
import { ErrorCollector, deliverErrorReport } from "../application/errorReporting.js";
import { mailConfig, mailScope, sendErrorReport, saveUnsentReport } from "../infrastructure/errorReportMail.js";
import { DateTime } from "luxon";
import { runMorningBriefing } from "../application/runMorningBriefing.js";
import { createDependencies } from "../bootstrap/createApp.js";
import { loadConfig, loadGoogleCalendarConfig } from "../bootstrap/config.js";
import { authorizeGoogleCalendar } from "../infrastructure/googleCalendar.js";

async function main(): Promise<void> {
  // pnpm 8 passes its argument delimiter through to the script.
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const knownArgs = new Set(["auth", "auth:mail", "--no-speech"]);
  const unknown = args.find((arg) => !knownArgs.has(arg));
  if (unknown) throw new Error(`不明な引数です: ${unknown}`);
  if ((args.includes("auth") || args.includes("auth:mail")) && args.includes("--no-speech")) {
    throw new Error("認証と --no-speech は同時に指定できません。");
  }

  if (args.includes("auth") && args.includes("auth:mail")) throw new Error("認証操作を1つだけ指定してください。");

  if (args.includes("auth:mail")) {
    await authorizeGoogleCalendar(mailConfig(), mailScope);
    console.log("メール送信用の認証情報を保存しました。");
    return;
  }

  if (args.includes("auth")) {
    await authorizeGoogleCalendar(loadGoogleCalendarConfig());
    console.log("Google Calendarの認証情報を保存しました。");
    return;
  }

  const errors = new ErrorCollector();
  const started = new Date().toISOString();
  let stage = "設定・初期化";
  let timeZone = "UTC";
  try {
    const config = loadConfig();
    timeZone = config.timeZone;
    const now = DateTime.now().setZone(timeZone);
    if (!now.isValid) throw new Error("タイムゾーン設定不正");
    const dependencies = createDependencies(config, errors);
    stage = "朝の実行";
    console.log(`${config.location.name}の朝のブリーフィングを作成します…`);
    await runMorningBriefing(dependencies, {
      today: { date: now.toISODate(), timeZone }, locationName: config.location.name,
      speak: !args.includes("--no-speech"),
    });
  } catch (error) {
    if (!errors.issues.some(issue => issue.fatal)) {
      errors.fatal(stage, error);
    }
    throw error;
  } finally {
    if (process.env.ERROR_REPORT_EMAIL_ENABLED === "true") {
      await deliverErrorReport({ id: randomUUID(), date: started, timeZone, platform: process.platform,
        issues: errors.issues }, sendErrorReport, saveUnsentReport);
    }
  }
}

function printUsage(): void {
  console.log("使い方:\n  pnpm dev [-- --no-speech]\n  pnpm auth\n  pnpm auth:mail");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nエラー: ${message}`);
  process.exitCode = 1;
});
