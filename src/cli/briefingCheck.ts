import { readFile, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createBriefingReviewPlan, reviewBriefingText, type BriefingReviewFixture } from "../domain/briefingReview.js";
import { OpenAiBriefingNarrator } from "../infrastructure/openAiNarrator.js";
import { morningBriefingProfile } from "../bootstrap/briefingProfile.js";

class BriefingCheckError extends Error {}

export function formatBriefingCheckError(error: unknown): string {
  // SDK・OSの生エラーには原稿・認証情報・個人のパスが含まれ得る。
  return error instanceof BriefingCheckError ? error.message : "確認処理で予期しないエラーが発生しました。設定と確認ケースを見直してください。";
}

export function generationFailureMessage(error: unknown): string {
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  if (status === 401 || status === 403) return "生成失敗: OpenAIの認証・アクセス権限を確認してください。";
  if (status === 429) return "生成失敗: OpenAIの利用上限・リクエスト制限を確認してください。";
  if (typeof status === "number" && status >= 500 && status < 600) return "生成失敗: OpenAI側でエラーが発生しました。時間を置いて再実行してください。";
  return "生成失敗: 通信状態やモデル設定を確認してください。";
}

export function parseBriefingCheckArgs(args: string[]) {
  let generate = false, localProfile = false;
  let cookingPlace: string | undefined, outputDir: string | undefined, cases: string[] | undefined;
  const seen = new Set<string>();
  for (const arg of args.filter(value => value !== "--")) {
    const key = arg.split("=")[0];
    if (seen.has(key)) throw new BriefingCheckError("引数が重複しています。同じオプションは一度だけ指定してください。");
    seen.add(key);
    if (arg === "--generate") generate = true;
    else if (arg === "--local-profile") localProfile = true;
    else if (arg.startsWith("--cooking-place=")) cookingPlace = arg.slice("--cooking-place=".length).trim();
    else if (arg.startsWith("--output-dir=")) outputDir = arg.slice("--output-dir=".length).trim();
    else if (arg.startsWith("--cases=")) cases = arg.slice("--cases=".length).split(",").map(value => value.trim());
    else throw new BriefingCheckError("不明な引数です。READMEの確認コマンドのオプションを確認してください。");
  }
  if (localProfile && !cookingPlace) throw new BriefingCheckError("--local-profile では --cooking-place=通常の開催地 を指定してください。");
  if (seen.has("--cooking-place") && (!localProfile || !cookingPlace)) throw new BriefingCheckError("開催地は --local-profile と合わせて指定してください。");
  if (seen.has("--output-dir") && !outputDir) throw new BriefingCheckError("出力先を指定してください。");
  if (cases?.some(value => !value)) throw new BriefingCheckError("ケースIDを指定してください。");
  return { generate, localProfile, cookingPlace, outputDir, cases };
}

export async function runBriefingCheck(args: string[]) {
  const options = parseBriefingCheckArgs(args);
  let fixture: BriefingReviewFixture;
  try { fixture = JSON.parse(await readFile(resolve("scripts/fixtures/briefing-review-cases.json"), "utf8")) as BriefingReviewFixture; }
  catch { throw new BriefingCheckError("確認ケースを読み込めません。リポジトリのルートで実行し、JSONファイルを確認してください。"); }
  if (options.cases?.some(id => !fixture.cases.some(scenario => scenario.id === id))) throw new BriefingCheckError("存在しないケースIDです。引数なしで一覧を確認してください。");
  const cases = fixture.cases.filter(scenario => !options.cases || options.cases.includes(scenario.id));
  if (!options.generate) {
    console.log("原稿生成は行いません。--generate を付けるとOpenAIへ送信し、ケース数分の生成を行います。");
    for (const scenario of cases) console.log(`${scenario.id}: ${scenario.label}`);
    return;
  }
  const dotenv = await import("dotenv");
  dotenv.config({ quiet: true });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new BriefingCheckError("OPENAI_API_KEYを設定してください。");
  let rules = fixture.profile.rules;
  const cookingPlace = options.cookingPlace ?? fixture.profile.cookingPlace;
  if (options.localProfile) {
    const { personalProfile } = await import("../bootstrap/personalProfile.js").catch(() => { throw new BriefingCheckError("ローカルプロフィールを読み込めません。personalProfile.tsを確認してください。"); });
    const prefixes = ["🗿", "🍳", "🚚"];
    const hints = new Map(prefixes.map(prefix => {
      const rule = personalProfile.scheduleRules.prefixRules.find(value => value.prefix === prefix);
      if (!rule) throw new BriefingCheckError("ローカルの3種類の補足設定を確認してください。");
      return [prefix, rule.hint];
    }));
    rules = { ...rules, prefixRules: rules.prefixRules.map(rule => ({ ...rule, hint: hints.get(rule.prefix) ?? rule.hint })) };
  }
  let directory: string;
  try {
    directory = options.outputDir ? resolve(options.outputDir) : await mkdtemp(join(tmpdir(), "ohayo-briefing-review-"));
    if (options.outputDir) await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST")
      throw new BriefingCheckError("出力先が既に存在します。--output-dirには新しいディレクトリを指定してください。");
    throw new BriefingCheckError("出力先を作成できません。親ディレクトリと書き込み権限を確認してください。");
  }
  async function save(name: string, contents: string) {
    try { await writeFile(join(directory, name), contents, { mode: 0o600 }); }
    catch { throw new BriefingCheckError("確認結果を保存できません。出力先の書き込み権限と空き容量を確認してください。"); }
  }
  const narrator = new OpenAiBriefingNarrator(apiKey, morningBriefingProfile);
  const results: Array<{ id: string; label: string; text: string; checks: ReturnType<typeof reviewBriefingText>; error?: string }> = [];
  let next = 0;
  async function worker() {
    while (next < cases.length) {
      const scenario = cases[next++];
      const plan = createBriefingReviewPlan(scenario, rules);
      let text = "", error: string | undefined;
      try { text = await narrator.narrate(plan); }
      catch (cause) { error = generationFailureMessage(cause); }
      const checks = reviewBriefingText(scenario, text, cookingPlace);
      const result = { id: scenario.id, label: scenario.label, text, checks, ...(error ? { error } : {}) };
      await save(`${scenario.id}.json`, JSON.stringify({ scenario, plan, ...result }, null, 2));
      results.push(result);
      console.log(`${scenario.id}: ${!error && checks.every(check => check.passed) ? "一次確認OK" : "要確認"}`);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  results.sort((a, b) => fixture.cases.findIndex(value => value.id === a.id) - fixture.cases.findIndex(value => value.id === b.id));
  const report = ["# 原稿生成の確認結果", "", `モデル: ${morningBriefingProfile.model} / ${morningBriefingProfile.reasoningEffort}`,
    `プロフィール: ${options.localProfile ? "ローカルの補足3件と架空の名前・予定" : "架空のプロフィール"}`,
    "キーワードと予定ごとの時刻・場所による一次確認です。文脈が曖昧な場合も要確認になります。意味や自然さは原稿も確認してください。", "",
    ...results.flatMap(result => [`## ${result.id} ${result.label}`, "", result.error ?? result.text, "",
      ...result.checks.map(check => `- ${check.passed ? "OK" : "要確認"}: ${check.kind} / ${check.expected}`), ""])];
  await save("report.md", report.join("\n"));
  await save("results.json", JSON.stringify(results, null, 2));
  console.log(`原稿・判定結果: ${join(directory, "report.md")}`);
  if (results.some(result => result.error || result.checks.some(check => !check.passed))) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBriefingCheck(process.argv.slice(2)).catch(error => { console.error(formatBriefingCheckError(error)); process.exitCode = 1; });
}
