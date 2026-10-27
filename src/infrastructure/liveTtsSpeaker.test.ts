import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), speech: vi.fn(), transcribe: vi.fn(), convert: vi.fn() }));
vi.mock("./liveSpeech.js", () => ({ OpenAiLiveSpeech: class { generate = mocks.generate; } }));
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
import { createLiveTtsSpeaker } from "./liveTtsSpeaker.js";

const text = "おはようございます。9月4日は晴れです。それでは、よい一日を。";
const profile = { model: "gpt-live-1", voice: "harema", instructions: "test style" };
let root: string;
beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(join(tmpdir(), "ohayo-live-speaker-"));
  mocks.generate.mockReset().mockResolvedValue({ wav: Buffer.from([1, 2, 3, 4]), transcript: text, sessionSeconds: 45 });
  mocks.transcribe.mockReset().mockResolvedValue({ text });
  mocks.convert.mockReset().mockImplementation(async (input: string, output: string) => {
    const { copyFile } = await import("node:fs/promises");
    await copyFile(input, output);
  });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("Live production speaker", () => {
  it("uses Live for generation, retains independent tail validation and private diagnostics", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const speaker = createLiveTtsSpeaker("test", profile, { play }, { diagnosticRoot: root, maxAttempts: 1 });
    await speaker.speak(text);
    expect(mocks.generate).toHaveBeenCalledWith(text, expect.any(Number));
    expect(mocks.generate.mock.calls[0][1]).toBeGreaterThan(35_000);
    expect(mocks.generate.mock.calls[0][1]).toBeLessThanOrEqual(90_000);
    expect(mocks.speech).not.toHaveBeenCalled();
    expect(mocks.transcribe).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledOnce();
    const [wavPath] = mocks.convert.mock.calls[0];
    await expect(stat(wavPath)).rejects.toMatchObject({ code: "ENOENT" });
    const directory = join(root, (await readdir(root))[0]!);
    expect(await readFile(join(directory, "attempt-1-generated-transcript.txt"), "utf8")).toBe(text);
    const metadata = JSON.parse(await readFile(join(directory, "metadata.json"), "utf8"));
    expect(metadata.attempts[0].sessionSeconds).toBe(45);
    expect(metadata).toMatchObject({ model: profile.model, voice: "harema", selectedAttempt: 1, usedFallbackClosing: false });
  });
  it("keeps the scheduled playback time after Live generation", async () => {
    const calls: string[] = [];
    const sleep = vi.fn(async () => { calls.push("wait"); });
    const play = vi.fn(async () => { calls.push("play"); });
    const speaker = createLiveTtsSpeaker("test", profile, { play }, {
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
    const speaker = createLiveTtsSpeaker("test", profile, { play }, { diagnosticRoot: root, maxAttempts: 1 });
    await expect(speaker.speak(text)).rejects.toThrow("conversion failed");
    expect(play).not.toHaveBeenCalled();
    const [wavPath] = mocks.convert.mock.calls[0];
    await expect(stat(wavPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("recovers a transient Live failure with the existing retry flow", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("temporary"));
    const recordIssue = vi.fn();
    const play = vi.fn().mockResolvedValue(undefined);
    const speaker = createLiveTtsSpeaker("test", profile, { play }, { diagnosticRoot: root, maxAttempts: 2, recordIssue });
    await speaker.speak(text);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalledOnce();
    expect(recordIssue).not.toHaveBeenCalled();
  });
});
