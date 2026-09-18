import type { IssueRecorder } from "../domain/errorReport.js";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DateTime } from "luxon";
import OpenAI from "openai";
import type { Speaker } from "../application/ports.js";
import type { AudioPlayer } from "./audioPlayer.js";
import {
  concatenateClosingWithNaturalPause,
  extractAudioTail,
  measureTrailingSilenceMs,
} from "./audioProcessing.js";
import { toJapaneseSpeechText } from "./japaneseSpeechText.js";
import { assessTtsTranscript, extractFinalSentences, type TtsTranscriptAssessment } from "./ttsRecovery.js";

const DEFAULT_CLOSING_AUDIO_PATH = fileURLToPath(
  new URL("../../assets/audio/generic-closing-zero-lead.wav", import.meta.url),
);
const DEFAULT_DIAGNOSTIC_RETENTION_DAYS = 14;

type OpenAiTtsSpeakerOptions = {
  recordIssue?: IssueRecorder;
  maxAttempts?: number;
  preparationBudgetMs?: number;
  playAt?: string;
  timeZone?: string;
  closingAudioPath?: string;
  diagnosticRoot?: string;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

type TtsCandidate = {
  attempt: number;
  audioPath: string;
  assessment?: TtsTranscriptAssessment;
  transcript?: string;
  trailingSilenceMs?: number;
  issues?: string[];
};

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
    private readonly options: OpenAiTtsSpeakerOptions = {},
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async speak(text: string): Promise<void> {
    const now = this.options.now ?? Date.now;
    const sleep = this.options.sleep ?? delay;
    const startedAt = now();
    const playbackNotBefore = resolvePlaybackTime(
      this.options.playAt,
      this.options.timeZone,
      startedAt,
    );
    const deadline = Math.min(
      startedAt + (this.options.preparationBudgetMs ?? 90_000),
      playbackNotBefore === undefined ? Number.POSITIVE_INFINITY : playbackNotBefore - 10_000,
    );
    const maxAttempts = this.options.maxAttempts ?? 3;
    const directory = await mkdtemp(join(tmpdir(), "ohayo-bot-"));
    const diagnosticDirectory = await this.createDiagnosticDirectory(text, startedAt);
    const expectedClosing = extractFinalSentences(text).closing;
    const candidates: TtsCandidate[] = [];
    let lastError: unknown;

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (attempt > 1 && deadline - now() < 12_000) break;
        const audioPath = join(directory, `briefing-attempt-${attempt}.mp3`);
        try {
          const speech = await this.client.audio.speech.create({
            model: this.model,
            voice: this.voice,
            input: toJapaneseSpeechText(text),
            response_format: "mp3",
            instructions: this.instructions,
            speed: this.speed,
          }, { timeout: requestTimeout(deadline, now(), 35_000) });
          await writeFile(audioPath, Buffer.from(await speech.arrayBuffer()), { mode: 0o600 });
          await this.copyDiagnosticFile(audioPath, diagnosticDirectory, `attempt-${attempt}.mp3`);

          const candidate = await this.validateCandidate({
            attempt,
            audioPath,
            expectedText: text,
            expectedClosing,
            directory,
            diagnosticDirectory,
            deadline,
            now,
          });
          candidates.push(candidate);
          if (!candidate.assessment) break;
          if (candidate.assessment.hasClosing) break;
          console.warn(`TTSの末尾欠落を検出しました。全文を再生成します（${attempt}/${maxAttempts}）。`);
        } catch (error) {
          lastError = error;
          console.warn(`TTS生成または検査に失敗しました（${attempt}/${maxAttempts}）。`);
        }
      }

      if (candidates.length === 0) throw lastError ?? new Error("音声を生成できませんでした。");
      const bestCandidate = selectBestCandidate(candidates);
      for (const code of bestCandidate.issues ?? []) this.options.recordIssue?.("TTS検査", code);
      if (bestCandidate.assessment?.hasClosing === false) this.options.recordIssue?.("TTS生成", "CLOSING_MISSING");
      const playablePath = await this.prepareFallbackIfNeeded(bestCandidate, directory, diagnosticDirectory);
      await this.writeDiagnosticMetadata(diagnosticDirectory, {
        startedAt: new Date(startedAt).toISOString(),
        playbackNotBefore: playbackNotBefore === undefined ? null : new Date(playbackNotBefore).toISOString(),
        selectedAttempt: bestCandidate.attempt,
        usedFallbackClosing: playablePath !== bestCandidate.audioPath,
        attempts: candidates.map((candidate) => ({
          attempt: candidate.attempt,
          closingScore: candidate.assessment?.closingScore ?? null,
          precedingScore: candidate.assessment?.precedingScore ?? null,
          hasClosing: candidate.assessment?.hasClosing ?? null,
          canAppendFallbackClosing: candidate.assessment?.canAppendFallbackClosing ?? null,
          trailingSilenceMs: candidate.trailingSilenceMs ?? null,
        })),
      });

      const waitMs = playbackNotBefore === undefined ? 0 : playbackNotBefore - now();
      if (waitMs > 0) await sleep(waitMs);
      await this.audioPlayer.play(playablePath);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async validateCandidate(options: {
    attempt: number;
    audioPath: string;
    expectedText: string;
    expectedClosing: string;
    directory: string;
    diagnosticDirectory?: string;
    deadline: number;
    now: () => number;
  }): Promise<TtsCandidate> {
    const issues: string[] = [];
    const tailPath = join(options.directory, `tail-${options.attempt}.wav`);
    let transcriptionPath = options.audioPath;
    try {
      await extractAudioTail(options.audioPath, tailPath);
      transcriptionPath = tailPath;
    } catch (error) {
      console.warn(`音声末尾の抽出に失敗したため、生成音声全体を検査します: ${errorMessage(error)}`);
    }

    if (Number.isFinite(options.deadline) && options.deadline - options.now() < 5_000) {
      return { attempt: options.attempt, audioPath: options.audioPath, issues: ["VALIDATION_SKIPPED"] };
    }

    try {
      const [transcript, trailingSilenceMs] = await Promise.all([
        this.client.audio.transcriptions.create({
          file: createReadStream(transcriptionPath),
          model: "gpt-4o-mini-transcribe",
          language: "ja",
          prompt: options.expectedClosing,
        }, { timeout: requestTimeout(options.deadline, options.now(), 20_000) }),
        measureTrailingSilenceMs(options.audioPath).catch(() => undefined),
      ]);
      if (options.diagnosticDirectory) {
        await writeFile(join(options.diagnosticDirectory, `attempt-${options.attempt}-transcript.txt`), transcript.text, { mode: 0o600 });
      }
      if (trailingSilenceMs === undefined) issues.push("SILENCE_MEASUREMENT_FAILED");
      return {
        issues,
        attempt: options.attempt,
        audioPath: options.audioPath,
        assessment: assessTtsTranscript(options.expectedText, transcript.text),
        transcript: transcript.text,
        trailingSilenceMs,
      };
    } catch (error) {
      console.warn(`TTS末尾の自動検査に失敗したため、生成済み音声をそのまま使用します: ${errorMessage(error)}`);
      return { attempt: options.attempt, audioPath: options.audioPath, issues: ["VALIDATION_FAILED"] };
    }
  }

  private async prepareFallbackIfNeeded(
    candidate: TtsCandidate,
    directory: string,
    diagnosticDirectory?: string,
  ): Promise<string> {
    if (candidate.assessment?.hasClosing !== false || !candidate.assessment.canAppendFallbackClosing) {
      return candidate.audioPath;
    }
    const outputPath = join(directory, "briefing-with-fallback-closing.mp3");
    try {
      const adjustment = await concatenateClosingWithNaturalPause({
        briefingPath: candidate.audioPath,
        closingPath: this.options.closingAudioPath ?? DEFAULT_CLOSING_AUDIO_PATH,
        outputPath,
      });
      console.warn(
        `汎用の締め挨拶を連結しました（終端無音${adjustment.trailingSilenceMs}ms、追加${adjustment.padMs}ms、削減${adjustment.trimMs}ms）。`,
      );
      await this.copyDiagnosticFile(outputPath, diagnosticDirectory, "selected-with-fallback.mp3");
      return outputPath;
    } catch (error) {
      this.options.recordIssue?.("TTS補完", "APPEND_FAILED");
      console.warn(`汎用の締め挨拶を連結できなかったため、最良の生成音声を使用します: ${errorMessage(error)}`);
      return candidate.audioPath;
    }
  }

  private async createDiagnosticDirectory(text: string, startedAt: number): Promise<string | undefined> {
    const root = this.options.diagnosticRoot ?? join(homedir(), ".local", "state", "ohayo-bot", "tts");
    const name = `${new Date(startedAt).toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
    const directory = join(root, name);
    try {
      await mkdir(root, { recursive: true, mode: 0o700 });
      try {
        const cutoffMs = startedAt - DEFAULT_DIAGNOSTIC_RETENTION_DAYS * 24 * 60 * 60 * 1_000;
        await cleanupExpiredDiagnosticDirectories(root, cutoffMs);
      } catch (error) {
        this.options.recordIssue?.("TTS診断保存", "CLEANUP_FAILED");
      console.warn(`古いTTS診断データを削除できませんでした: ${errorMessage(error)}`);
      }
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(join(directory, "input.txt"), text, { mode: 0o600 });
      return directory;
    } catch (error) {
      this.options.recordIssue?.("TTS診断保存", "DIRECTORY_FAILED");
      console.warn(`TTS診断データの保存先を作成できませんでした: ${errorMessage(error)}`);
      return undefined;
    }
  }

  private async copyDiagnosticFile(source: string, directory: string | undefined, name: string): Promise<void> {
    if (!directory) return;
    try {
      const destination = join(directory, name);
      await copyFile(source, destination);
      await chmod(destination, 0o600);
    } catch (error) {
      this.options.recordIssue?.("TTS診断保存", "AUDIO_SAVE_FAILED");
      console.warn(`TTS診断用の音声を保存できませんでした: ${errorMessage(error)}`);
    }
  }

  private async writeDiagnosticMetadata(directory: string | undefined, metadata: unknown): Promise<void> {
    if (!directory) return;
    try {
      await writeFile(join(directory, "metadata.json"), JSON.stringify(metadata, null, 2), { mode: 0o600 });
    } catch (error) {
      this.options.recordIssue?.("TTS診断保存", "METADATA_SAVE_FAILED");
      console.warn(`TTS診断メタデータを保存できませんでした: ${errorMessage(error)}`);
    }
  }
}

export async function cleanupExpiredDiagnosticDirectories(root: string, cutoffMs: number): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const path = join(root, entry.name);
      const information = await stat(path);
      if (information.mtimeMs < cutoffMs) {
        await rm(path, { recursive: true, force: true });
      }
    }));
}

export function resolvePlaybackTime(playAt: string | undefined, timeZone: string | undefined, nowMs: number): number | undefined {
  if (!playAt || !timeZone) return undefined;
  const [hour, minute] = playAt.split(":").map(Number);
  const now = DateTime.fromMillis(nowMs, { zone: timeZone });
  const target = now.set({ hour, minute, second: 0, millisecond: 0 });
  return target.toMillis() > nowMs ? target.toMillis() : undefined;
}

function selectBestCandidate(candidates: TtsCandidate[]): TtsCandidate {
  return [...candidates].sort((left, right) => {
    const leftScore = (left.assessment?.closingScore ?? 0.5) + (left.assessment?.precedingScore ?? 0.5) * 0.25;
    const rightScore = (right.assessment?.closingScore ?? 0.5) + (right.assessment?.precedingScore ?? 0.5) * 0.25;
    return rightScore - leftScore;
  })[0]!;
}

function requestTimeout(deadline: number, now: number, maximumMs: number): number {
  if (!Number.isFinite(deadline)) return maximumMs;
  return Math.max(5_000, Math.min(maximumMs, deadline - now));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
