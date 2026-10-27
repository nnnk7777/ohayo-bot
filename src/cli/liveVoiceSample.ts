import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { liveSpeechProfile } from "../bootstrap/liveSpeechProfile.js";
import { OpenAiLiveSpeech } from "../infrastructure/liveSpeech.js";
import { createAudioPlayer } from "../infrastructure/audioPlayer.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter(arg => arg !== "--");
  const textFile = args.find(arg => arg.startsWith("--text-file="))?.slice("--text-file=".length);
  const outputDirectory = args.find(arg => arg.startsWith("--output-dir="))?.slice("--output-dir=".length);
  if (!textFile || !outputDirectory || args.some(arg => !arg.startsWith("--text-file=") && !arg.startsWith("--output-dir=") && arg !== "--play")) {
    throw new Error("使い方: pnpm voice:live -- --text-file=原稿.txt --output-dir=保存先 [--play]");
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEYを設定してください。");
  const text = await readFile(resolve(textFile), "utf8");
  const directory = resolve(outputDirectory);
  // Refuse an existing folder so repeated trials cannot silently overwrite samples.
  await mkdir(directory, { mode: 0o700 });
  const generator = new OpenAiLiveSpeech(apiKey, liveSpeechProfile);
  const result = await generator.generate(text);
  await writeFile(join(directory, "usage.json"), JSON.stringify({ sessionSeconds: result.sessionSeconds }), { mode: 0o600 });
  const audioPath = join(directory, "sample.wav");
  await writeFile(audioPath, result.wav, { mode: 0o600 });
  await writeFile(join(directory, "input.txt"), text, { mode: 0o600 });
  await writeFile(join(directory, "transcript.txt"), result.transcript, { mode: 0o600 });
  await writeFile(join(directory, "profile.json"), JSON.stringify(liveSpeechProfile, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ status: "AUDIO_SAVED", model: liveSpeechProfile.model, audioPath, transcriptPath: join(directory, "transcript.txt") }));
  if (args.includes("--play")) {
    await createAudioPlayer("auto").play(audioPath);
    console.log("PLAYBACK_COMPLETED");
  }
}

void main().catch((error: unknown) => {
  // Do not print raw transport errors: they may contain request or script data.
  if (error instanceof Error && /^(Live|読み上げ原稿|使い方:|OPENAI_API_KEYを)/.test(error.message)) {
    console.error(error.message);
  } else {
    console.error("Live試聴に失敗しました。入力パス・保存先・接続を確認してください。");
  }
  process.exitCode = 1;
});
