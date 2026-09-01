import { spawn } from "node:child_process";

export type AudioPlayerPreference = "auto" | "afplay" | "mpg123";

export interface AudioPlayer {
  play(audioPath: string): Promise<void>;
}

export function createAudioPlayer(preference: AudioPlayerPreference): AudioPlayer {
  return new CommandAudioPlayer(resolveAudioPlayerCommand(preference, process.platform));
}

export function resolveAudioPlayerCommand(
  preference: AudioPlayerPreference,
  platform: NodeJS.Platform,
): "afplay" | "mpg123" {
  if (preference === "afplay" || preference === "mpg123") return preference;
  if (platform === "darwin") return "afplay";
  if (platform === "linux") return "mpg123";
  throw new Error(`音声再生に対応していないOSです: ${platform}`);
}

class CommandAudioPlayer implements AudioPlayer {
  constructor(private readonly command: "afplay" | "mpg123") {}

  play(audioPath: string): Promise<void> {
    const args = this.command === "mpg123" ? ["-q", audioPath] : [audioPath];

    return new Promise((resolve, reject) => {
      const process = spawn(this.command, args, { stdio: "inherit" });
      process.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" && this.command === "mpg123") {
          reject(new Error("mpg123 が見つかりません。macOSでは `brew install mpg123`、Raspberry Piでは `sudo apt install mpg123` を実行してください。"));
          return;
        }
        reject(error);
      });
      process.once("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${this.command} が終了コード ${code ?? "unknown"} で失敗しました。`));
      });
    });
  }
}
