import { createDependencies } from "../bootstrap/createApp.js";
import { loadConfig } from "../bootstrap/config.js";
import {
  briefingScenarioNames,
  getBriefingScenario,
  type BriefingScenarioName,
} from "../domain/briefingScenarios.js";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2).filter((arg) => arg !== "--"));
  if (options.list) {
    printUsage();
    return;
  }

  const { narrator, speaker } = createDependencies(loadConfig());
  for (const scenario of options.scenarios) {
    const briefing = (await narrator.narrate(getBriefingScenario(scenario))).trim();
    if (!briefing) throw new Error(`${scenario} の原稿生成に失敗しました。空の原稿が返されました。`);

    console.log(`\n--- ${scenario} ---\n\n${briefing}\n`);
    if (options.speak) await speaker.speak(briefing);
  }
}

function parseArgs(args: string[]): { scenarios: BriefingScenarioName[]; speak: boolean; list: boolean } {
  if (args.length === 0) return { scenarios: ["rain"], speak: false, list: false };
  if (args.length === 1 && args[0] === "--list") {
    return { scenarios: [], speak: false, list: true };
  }

  const scenarioArg = args.find((arg) => arg.startsWith("--scenario="));
  const otherArgs = args.filter((arg) => arg !== scenarioArg && arg !== "--speech");
  if (otherArgs.length > 0) throw new Error("使い方: pnpm briefing:sample [-- --scenario=rain|all] [--speech]");

  const scenarioValue = scenarioArg?.slice("--scenario=".length) || "rain";
  const scenarios =
    scenarioValue === "all"
      ? [...briefingScenarioNames]
      : scenarioValue.split(",").map((name) => parseScenarioName(name));

  return { scenarios, speak: args.includes("--speech"), list: false };
}

function parseScenarioName(value: string): BriefingScenarioName {
  const name = value.trim();
  if ((briefingScenarioNames as readonly string[]).includes(name)) {
    return name as BriefingScenarioName;
  }
  throw new Error(`不明なシナリオです: ${name}`);
}

function printUsage(): void {
  console.log([
    "使い方:",
    "  pnpm briefing:sample",
    "  pnpm briefing:sample -- --scenario=rain",
    "  pnpm briefing:sample -- --scenario=rain,busy",
    "  pnpm briefing:sample -- --scenario=all",
    "  pnpm briefing:sample -- --scenario=rain --speech",
    "",
    `シナリオ: ${briefingScenarioNames.join(", ")}`,
  ].join("\n"));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nエラー: ${message}`);
  process.exitCode = 1;
});
