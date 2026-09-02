import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { pathToFileURL } from "node:url";
import { createDependencies } from "../bootstrap/createApp.js";
import { loadConfig } from "../bootstrap/config.js";
import {
  briefingScenarioLabels,
  briefingScenarioNames,
  composeBriefingScenario,
  getBriefingScenario,
  type BriefingScenarioName,
} from "../domain/briefingScenarios.js";

async function main(): Promise<void> {
  let options = parseArgs(process.argv.slice(2).filter((arg) => arg !== "--"));
  if (options.list) {
    printUsage();
    return;
  }

  if (options.interactive) {
    const selected = await selectInteractively();
    if (!selected) return;
    options = { ...options, ...selected, interactive: false, combine: true };
  }

  const { narrator, speaker } = createDependencies(loadConfig());
  const plans = options.combine
    ? [{ label: options.scenarios.join(" + "), plan: composeBriefingScenario(options.scenarios) }]
    : options.scenarios.map((scenario) => ({ label: scenario, plan: getBriefingScenario(scenario) }));

  for (const { label, plan } of plans) {
    const briefing = (await narrator.narrate(plan)).trim();
    if (!briefing) throw new Error(`${label} の原稿生成に失敗しました。空の原稿が返されました。`);

    console.log(`\n--- ${label} ---\n\n${briefing}\n`);
    if (options.speak) await speaker.speak(briefing);
  }
}

export function parseArgs(args: string[]): {
  scenarios: BriefingScenarioName[];
  speak: boolean;
  list: boolean;
  interactive: boolean;
  combine: boolean;
} {
  if (args.length === 0) return {
    scenarios: ["rain"],
    speak: false,
    list: false,
    interactive: false,
    combine: false,
  };
  if (args.length === 1 && args[0] === "--list") {
    return { scenarios: [], speak: false, list: true, interactive: false, combine: false };
  }

  if (args.length === 1 && args[0] === "--interactive") {
    return { scenarios: [], speak: false, list: false, interactive: true, combine: false };
  }

  const scenarioArg = args.find((arg) => arg.startsWith("--scenario="));
  const otherArgs = args.filter((arg) => arg !== scenarioArg && arg !== "--speech");
  if (otherArgs.length > 0) throw new Error("使い方: pnpm briefing:sample [-- --scenario=rain|all] [--speech] または --interactive");

  const scenarioValue = scenarioArg?.slice("--scenario=".length) || "rain";
  const scenarios =
    scenarioValue === "all"
      ? [...briefingScenarioNames]
      : scenarioValue.split(",").map((name) => parseScenarioName(name));

  return { scenarios, speak: args.includes("--speech"), list: false, interactive: false, combine: false };
}

async function selectInteractively(): Promise<{ scenarios: BriefingScenarioName[]; speak: boolean } | undefined> {
  const prompt = createInterface({ input, output });
  try {
    console.log("\n原稿に組み合わせたい条件を番号で選んでください（例: 1,3,5）。");
    console.log("選んだ条件を一つの原稿にまとめます。空欄で終了します。\n");
    briefingScenarioNames.forEach((name, index) => {
      console.log(`  ${index + 1}. ${briefingScenarioLabels[name]} [${name}]`);
    });

    const selection = await prompt.question("\n番号: ");
    if (!selection.trim()) return undefined;
    const scenarios = parseScenarioSelection(selection);
    const speechAnswer = await prompt.question("読み上げますか？ [y/N]: ");
    return { scenarios, speak: /^(y|yes)$/i.test(speechAnswer.trim()) };
  } finally {
    prompt.close();
  }
}

export function parseScenarioSelection(value: string): BriefingScenarioName[] {
  if (value.trim().toLowerCase() === "all") {
    throw new Error("対話モードでは all は使えません。組み合わせたい条件を番号で選んでください。");
  }

  const selectedIndexes = value.split(",").map((item) => {
    const index = Number(item.trim());
    if (!Number.isInteger(index) || index < 1 || index > briefingScenarioNames.length) {
      throw new Error(`シナリオ番号は 1〜${briefingScenarioNames.length} で指定してください。`);
    }
    return index - 1;
  });

  return [...new Set(selectedIndexes)].map((index) => briefingScenarioNames[index]!);
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
    "  pnpm briefing:sample -- --interactive",
    "",
    "--interactive: 番号で複数の条件を選び、一つの原稿として生成します。読み上げ有無も選択します。",
    `シナリオ: ${briefingScenarioNames.map((name) => `${name}（${briefingScenarioLabels[name]}）`).join(", ")}`,
  ].join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nエラー: ${message}`);
    process.exitCode = 1;
  });
}
