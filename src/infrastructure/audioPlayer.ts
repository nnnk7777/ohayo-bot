import { spawn } from "node:child_process";

export type AudioPlayerPreference = "auto" | "afplay" | "mpg123" | "termux-media-player";

type AudioPlayerCommand = Exclude<AudioPlayerPreference, "auto">;
type TermuxPlaybackStatus = "playing" | "stopped" | "unknown";

export interface AudioPlayer {
  play(audioPath: string): Promise<void>;
}

export function createAudioPlayer(preference: AudioPlayerPreference): AudioPlayer {
  return new CommandAudioPlayer(resolveAudioPlayerCommand(preference, process.platform));
}

export function resolveAudioPlayerCommand(
  preference: AudioPlayerPreference,
  platform: NodeJS.Platform,
): AudioPlayerCommand {
  if (preference !== "auto") return preference;
  if (platform === "darwin") return "afplay";
  if (platform === "linux") return "mpg123";
  if (platform === "android") return "termux-media-player";
  throw new Error(`音声再生に対応していないOSです: ${platform}`);
}

class CommandAudioPlayer implements AudioPlayer {
  constructor(private readonly command: AudioPlayerCommand) {}

  play(audioPath: string): Promise<void> {
    const args =
      this.command === "mpg123"
        ? ["-q", audioPath]
        : this.command === "termux-media-player"
          ? ["play", audioPath]
          : [audioPath];

    return new Promise<void>((resolve, reject) => {
      const process = spawn(this.command, args, { stdio: "inherit" });
      process.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" && this.command === "mpg123") {
          reject(new Error("mpg123 が見つかりません。macOSでは `brew install mpg123`、Raspberry Piでは `sudo apt install mpg123` を実行してください。"));
          return;
        }
        if (error.code === "ENOENT" && this.command === "termux-media-player") {
          reject(new Error("termux-media-player が見つかりません。Termuxで `pkg install termux-api` を実行し、Termux:APIアプリもインストールしてください。"));
          return;
        }
        reject(error);
      });
      process.once("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${this.command} が終了コード ${code ?? "unknown"} で失敗しました。`));
      });
    }).then(async () => {
      if (this.command === "termux-media-player") {
        await waitForTermuxPlaybackCompletion();
      }
    });
  }
}

export function parseTermuxPlaybackStatus(output: string): TermuxPlaybackStatus {
  if (/Status:\s*(?:Playing|Paused)/i.test(output)) return "playing";
  if (/No track currently|Status:\s*Stopped/i.test(output)) return "stopped";
  return "unknown";
}

async function waitForTermuxPlaybackCompletion(): Promise<void> {
  const deadline = Date.now() + 10 * 60_000;
  let consecutiveUnknown = 0;
  while (Date.now() < deadline) {
    const result = await runCaptured("termux-media-player", ["info"]);
    const status = parseTermuxPlaybackStatus(`${result.stdout}\n${result.stderr}`);
    if (status === "stopped") return;
    if (status === "playing") consecutiveUnknown = 0;
    else consecutiveUnknown += 1;
    if (consecutiveUnknown >= 3) {
      throw new Error("termux-media-player の再生状態を確認できませんでした。");
    }
    await delay(500);
  }
  throw new Error("termux-media-player の再生完了待ちがタイムアウトしました。");
}

function runCaptured(command: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ stdout, stderr, code }));
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
