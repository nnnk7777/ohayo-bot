import { loadConfig } from "../bootstrap/config.js";
import { openAiTtsProfile } from "../bootstrap/speechProfile.js";
import { OpenAiTtsSpeaker } from "../infrastructure/speech.js";

const DEFAULT_VOICES = ["ash", "ballad", "coral", "cedar"];
const SAMPLE_TEXT = `9月1日、火曜日。今日は晴れ。現在25度、最高30度、最低22度の予報です。

午前9時から、ヤマトの段ボールが届く予定です。夜7時10分からは整体です。料金についてのメモがありますが、詳細は確認が必要です。`;

async function main(): Promise<void> {
  const voices = parseVoices(process.argv.slice(2).filter((arg) => arg !== "--"));
  const config = loadConfig();

  for (const voice of voices) {
    console.log(`\n--- ${voice} ---`);
    const speaker = new OpenAiTtsSpeaker(
      config.openAiApiKey,
      openAiTtsProfile.model,
      voice,
      openAiTtsProfile.instructions,
      openAiTtsProfile.speed,
    );
    await speaker.speak(SAMPLE_TEXT);
  }
}

function parseVoices(args: string[]): string[] {
  if (args.length === 0) return DEFAULT_VOICES;
  if (args.length === 1 && args[0].startsWith("--voices=")) {
    const voices = args[0]
      .slice("--voices=".length)
      .split(",")
      .map((voice) => voice.trim())
      .filter(Boolean);
    if (voices.length > 0) return voices;
  }
  throw new Error("使い方: pnpm voice:sample [-- --voices=ash,ballad]");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nエラー: ${message}`);
  process.exitCode = 1;
});
