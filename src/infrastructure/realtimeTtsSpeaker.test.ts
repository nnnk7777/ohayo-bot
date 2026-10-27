import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), speech: vi.fn(), transcribe: vi.fn(), convert: vi.fn() }));
vi.mock("./realtimeSpeech.js", () => ({ OpenAiRealtimeSpeech: class { generate = mocks.generate; } }));
vi.mock("openai", () => ({ default: class {
  audio = { speech: { create: mocks.speech }, transcriptions: { create: mocks.transcribe } };
} }));
vi.mock("node:fs", () => ({ createReadStream: vi.fn().mockReturnValue({}) }));
vi.mock("./audioProcessing.js", () => ({
  convertAudioToMp3: mocks.convert,
  extractAudioTail: vi.fn().mockResolvedValue(undefined),
  measureTrailingSilenceMs: vi.fn().mockResolvedValue(100),
  concatenateClosingWithNaturalPause: vi.fn(),
}));
import { createRealtimeTtsSpeaker } from "./realtimeTtsSpeaker.js";

const text = "おはようございます。9月4日は晴れです。それでは、よい一日を。";
const profile = { model: "gpt-realtime-2.1-mini", voice: "marin", speed: 1.03, instructions: "test style" };
let root: string;
beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(join(tmpdir(), "ohayo-realtime-speaker-"));
  mocks.generate.mockReset().mockResolvedValue({ wav: Buffer.from([1, 2, 3, 4]), transcript: text });
  mocks.transcribe.mockReset().mockResolvedValue({ text });
  mocks.convert.mockReset().mockImplementation(async (input: string, output: string) => {
    const { copyFile } = await import("node:fs/promises");
    await copyFile(input, output);
  });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("Realtime production speaker", () => {
  it("uses Realtime for generation, retains independent tail validation and private diagnostics", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const speaker = createRealtimeTtsSpeaker("test", profile, { play }, { diagnosticRoot: root, maxAttempts: 1 });
    await speaker.speak(text);
    expect(mocks.generate).toHaveBeenCalledWith(text, expect.any(Number));
    expect(mocks.speech).not.toHaveBeenCalled();
    expect(mocks.transcribe).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledOnce();
    const [wavPath] = mocks.convert.mock.calls[0];
    await expect(stat(wavPath)).rejects.toMatchObject({ code: "ENOENT" });
    const directory = join(root, (await readdir(root))[0]!);
    expect(await readFile(join(directory, "attempt-1-generated-transcript.txt"), "utf8")).toBe(text);
    const metadata = JSON.parse(await readFile(join(directory, "metadata.json"), "utf8"));
    expect(metadata).toMatchObject({ model: profile.model, voice: "marin", speed: 1.03, selectedAttempt: 1, usedFallbackClosing: false });
  });
  it("keeps the scheduled playback time after Realtime generation", async () => {
    const calls: string[] = [];
    const sleep = vi.fn(async () => { calls.push("wait"); });
    const play = vi.fn(async () => { calls.push("play"); });
    const speaker = createRealtimeTtsSpeaker("test", profile, { play }, {
      diagnosticRoot: root, maxAttempts: 1, playAt: "08:30", timeZone: "Asia/Tokyo",
      now: () => Date.parse("2026-10-26T08:28:00+09:00"), sleep,
    });
    await speaker.speak(text);
    expect(sleep).toHaveBeenCalledWith(120_000);
    expect(calls).toEqual(["wait", "play"]);
  });
  it("removes temporary WAV and does not play when MP3 conversion fails", async () => {
    mocks.convert.mockRejectedValue(new Error("conversion failed"));
    const play = vi.fn();
    const speaker = createRealtimeTtsSpeaker("test", profile, { play }, { diagnosticRoot: root, maxAttempts: 1 });
    await expect(speaker.speak(text)).rejects.toThrow("conversion failed");
    expect(play).not.toHaveBeenCalled();
    const [wavPath] = mocks.convert.mock.calls[0];
    await expect(stat(wavPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("recovers a transient Realtime failure with the existing retry flow", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("temporary"));
    const recordIssue = vi.fn();
    const play = vi.fn().mockResolvedValue(undefined);
    const speaker = createRealtimeTtsSpeaker("test", profile, { play }, { diagnosticRoot: root, maxAttempts: 2, recordIssue });
    await speaker.speak(text);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalledOnce();
    expect(recordIssue).not.toHaveBeenCalled();
  });
});
