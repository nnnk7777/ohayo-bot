import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";
import type { Speaker } from "../application/ports.js";
import type { AudioPlayer } from "./audioPlayer.js";
import { toJapaneseSpeechText } from "./japaneseSpeechText.js";

export class MacSaySpeaker implements Speaker {
  async speak(text: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const process = spawn("say", [text], { stdio: "inherit" });
      process.once("error", reject);
      process.once("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`say コマンドが終了コード ${code ?? "unknown"} で失敗しました。`));
      });
    });
  }
}

export class OpenAiTtsSpeaker implements Speaker {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly voice: string,
    private readonly instructions: string,
    private readonly speed: number,
    private readonly audioPlayer: AudioPlayer,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async speak(text: string): Promise<void> {
    const speech = await this.client.audio.speech.create({
      model: this.model,
      voice: this.voice,
      input: toJapaneseSpeechText(text),
      response_format: "mp3",
      instructions: this.instructions,
      speed: this.speed,
    });
    const directory = await mkdtemp(join(tmpdir(), "ohayo-bot-"));
    const audioPath = join(directory, "briefing.mp3");

    try {
      await writeFile(audioPath, Buffer.from(await speech.arrayBuffer()), { mode: 0o600 });
      await this.audioPlayer.play(audioPath);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
