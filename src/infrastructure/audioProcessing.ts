import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { calculateSeamAdjustment } from "./ttsRecovery.js";

const execFileAsync = promisify(execFile);

export type DetectedSilence = {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
};

export async function extractAudioTail(inputPath: string, outputPath: string, seconds = 12): Promise<void> {
  await runFfmpeg([
    "-y", "-sseof", `-${seconds}`, "-i", inputPath,
    "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", outputPath,
  ]);
}

export async function measureTrailingSilenceMs(inputPath: string, thresholdDb = -45): Promise<number> {
  const durationMs = await getAudioDurationMs(inputPath);
  const { stderr } = await runFfmpeg([
    "-i", inputPath,
    "-af", `silencedetect=noise=${thresholdDb}dB:d=0.03`,
    "-f", "null", "-",
  ]);
  const trailing = parseDetectedSilences(stderr).at(-1);
  if (!trailing || Math.abs(trailing.endSeconds * 1000 - durationMs) > 80) return 0;
  return Math.round(trailing.durationSeconds * 1000);
}

export async function concatenateClosingWithNaturalPause(options: {
  briefingPath: string;
  closingPath: string;
  outputPath: string;
  targetPauseMs?: number;
  closingLeadingSilenceMs?: number;
}): Promise<{ trailingSilenceMs: number; padMs: number; trimMs: number }> {
  const targetPauseMs = options.targetPauseMs ?? 600;
  const closingLeadingSilenceMs = options.closingLeadingSilenceMs ?? 0;
  const [durationMs, trailingSilenceMs] = await Promise.all([
    getAudioDurationMs(options.briefingPath),
    measureTrailingSilenceMs(options.briefingPath),
  ]);
  const { padMs, trimMs } = calculateSeamAdjustment(trailingSilenceMs, closingLeadingSilenceMs, targetPauseMs);
  const adjustedDurationMs = Math.max(1, durationMs - trimMs);
  const briefingFilter = padMs > 0
    ? `atrim=end=${seconds(durationMs)},apad=pad_dur=${seconds(padMs)},atrim=end=${seconds(durationMs + padMs)}`
    : `atrim=end=${seconds(adjustedDurationMs)}`;
  const filter = [
    `[0:a]${briefingFilter},aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono,asetpts=PTS-STARTPTS[briefing]`,
    "[1:a]aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono,asetpts=PTS-STARTPTS[closing]",
    "[briefing][closing]concat=n=2:v=0:a=1[out]",
  ].join(";");
  await runFfmpeg([
    "-y", "-i", options.briefingPath, "-i", options.closingPath,
    "-filter_complex", filter, "-map", "[out]",
    "-ar", "24000", "-ac", "1", "-b:a", "128k", options.outputPath,
  ]);
  return { trailingSilenceMs, padMs, trimMs };
}

export async function getAudioDurationMs(inputPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", inputPath,
    ]);
    const durationMs = Number(stdout.trim()) * 1000;
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("音声の長さを取得できませんでした。");
    return Math.round(durationMs);
  } catch (error) {
    throw commandError("ffprobe", error);
  }
}

export function parseDetectedSilences(output: string): DetectedSilence[] {
  const silences: DetectedSilence[] = [];
  let startSeconds: number | undefined;
  for (const line of output.split("\n")) {
    const start = line.match(/silence_start: ([0-9.]+)/);
    if (start) startSeconds = Number(start[1]);
    const end = line.match(/silence_end: ([0-9.]+) \| silence_duration: ([0-9.]+)/);
    if (end && startSeconds !== undefined) {
      silences.push({
        startSeconds,
        endSeconds: Number(end[1]),
        durationSeconds: Number(end[2]),
      });
      startSeconds = undefined;
    }
  }
  return silences;
}

async function runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "info", ...args], {
      maxBuffer: 1024 * 1024 * 8,
    });
  } catch (error) {
    throw commandError("ffmpeg", error);
  }
}

function commandError(command: "ffmpeg" | "ffprobe", error: unknown): Error {
  const candidate = error as NodeJS.ErrnoException;
  if (candidate.code === "ENOENT") {
    return new Error(`${command} が見つかりません。音声の末尾検査と復旧には ${command} が必要です。`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(6);
}
