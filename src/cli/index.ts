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

  const knownArgs = new Set(["auth", "--no-speech"]);
  const unknown = args.find((arg) => !knownArgs.has(arg));
  if (unknown) throw new Error(`不明な引数です: ${unknown}`);
  if (args.includes("auth") && args.includes("--no-speech")) {
    throw new Error("auth と --no-speech は同時に指定できません。");
  }

  if (args.includes("auth")) {
    await authorizeGoogleCalendar(loadGoogleCalendarConfig());
    console.log("Google Calendarの認証情報を保存しました。");
    return;
  }

  const config = loadConfig();

  const now = DateTime.now().setZone(config.timeZone);
  if (!now.isValid) throw new Error(`TIME_ZONE が正しくありません: ${config.timeZone}`);
  console.log(`${config.location.name}の朝のブリーフィングを作成します…`);
  await runMorningBriefing(createDependencies(config), {
    today: { date: now.toISODate(), timeZone: config.timeZone },
    locationName: config.location.name,
    speak: !args.includes("--no-speech"),
  });
}

function printUsage(): void {
  console.log("使い方:\n  pnpm dev [-- --no-speech]\n  pnpm auth");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nエラー: ${message}`);
  process.exitCode = 1;
});
