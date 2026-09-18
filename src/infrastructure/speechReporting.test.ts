import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ speech: vi.fn(), transcribe: vi.fn(), append: vi.fn() }));
vi.mock("openai", () => ({ default: class { audio = { speech: { create: mocks.speech }, transcriptions: { create: mocks.transcribe } }; } }));
vi.mock("./audioProcessing.js", () => ({
  extractAudioTail: vi.fn().mockResolvedValue(undefined),
  measureTrailingSilenceMs: vi.fn().mockResolvedValue(100),
  concatenateClosingWithNaturalPause: mocks.append,
}));
// Use the generated mp3 for transcription, avoiding a nonexistent mocked tail stream.
vi.mock("node:fs", () => ({ createReadStream: vi.fn().mockReturnValue({}) }));
import { OpenAiTtsSpeaker } from "./speech.js";
let directory: string;
beforeEach(async () => {
  vi.clearAllMocks();
  directory = await mkdtemp(join(tmpdir(), "ohayo-report-test-"));
  mocks.speech.mockReset().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(1) });
  mocks.transcribe.mockReset();
  mocks.append.mockReset().mockResolvedValue({ trailingSilenceMs: 100, padMs: 500, trimMs: 0 });
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
const text = "予定はありません。よい朝をお過ごしください。";
function setup(maxAttempts = 3) {
  const record = vi.fn();
  const play = vi.fn().mockResolvedValue(undefined);
  const speaker = new OpenAiTtsSpeaker("test", "test", "test", "test", 1, { play }, { recordIssue: record, diagnosticRoot: directory, maxAttempts });
  return { speaker, record, play };
}
it("TTS生成がリトライで復旧すれば通知しない", async () => {
  mocks.speech.mockRejectedValueOnce(new Error("temporary"));
  mocks.transcribe.mockResolvedValue({ text });
  const { speaker, record, play } = setup();
  await speaker.speak(text);
  expect(mocks.speech).toHaveBeenCalledTimes(2);
  expect(record).not.toHaveBeenCalled();
  expect(play).toHaveBeenCalledOnce();
});
it("末尾欠落が再生成で復旧すれば通知しない", async () => {
  mocks.transcribe.mockResolvedValueOnce({ text: "予定はありません。" }).mockResolvedValueOnce({ text });
  const { speaker, record } = setup();
  await speaker.speak(text);
  expect(mocks.speech).toHaveBeenCalledTimes(2);
  expect(record).not.toHaveBeenCalled();
});
it("末尾欠落が残れば部分失敗として通知する", async () => {
  mocks.transcribe.mockResolvedValue({ text: "予定はありません。" });
  const { speaker, record, play } = setup(1);
  await speaker.speak(text);
  expect(record).toHaveBeenCalledWith("TTS生成", "CLOSING_MISSING");
  expect(play).toHaveBeenCalledOnce();
});
it("検査失敗でも再生し、検査の失敗を通知する", async () => {
  mocks.transcribe.mockRejectedValue(new Error("private"));
  const { speaker, record, play } = setup();
  await speaker.speak(text);
  expect(record).toHaveBeenCalledWith("TTS検査", "VALIDATION_FAILED");
  expect(play).toHaveBeenCalledOnce();
});
it("全候補の生成に失敗したら呼び出し元に失敗を返す", async () => {
  mocks.speech.mockRejectedValue(new Error("generation failed"));
  const { speaker, play } = setup();
  await expect(speaker.speak(text)).rejects.toThrow("generation failed");
  expect(mocks.speech).toHaveBeenCalledTimes(3);
  expect(play).not.toHaveBeenCalled();
});
