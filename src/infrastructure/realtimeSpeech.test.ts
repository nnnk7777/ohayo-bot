import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiRealtimeSpeech, pcmToWav } from "./realtimeSpeech.js";

const mocks = vi.hoisted(() => ({ connections: [] as unknown[] }));
vi.mock("openai/realtime/ws", async () => {
  const { EventEmitter } = await import("node:events");
  return { OpenAIRealtimeWS: class extends EventEmitter {
    socket = Object.assign(new EventEmitter(), { terminate: vi.fn(() => this.socket.emit("close")) });
    send = vi.fn();
    constructor() { super(); mocks.connections.push(this); }
  } };
});

type MockConnection = EventEmitter & {
  send: ReturnType<typeof vi.fn>;
  socket: EventEmitter & { terminate: ReturnType<typeof vi.fn> };
};
const profile = { model: "gpt-realtime-2.1-mini", voice: "marin", speed: 1.03, instructions: "test style" };
const text = "おはようございます。穏やかな一日をお過ごしください。";
function setup(timeoutMs?: number) {
  const result = new OpenAiRealtimeSpeech("test-key", profile).generate(text, timeoutMs);
  const connection = mocks.connections.at(-1) as MockConnection;
  return { result, connection };
}
beforeEach(() => { mocks.connections.length = 0; });
afterEach(() => vi.useRealTimers());

describe("Realtime speech", () => {
  it("sends the complete fixed text once after audio configuration is acknowledged", async () => {
    const { result, connection } = setup();
    connection.emit("session.created", {});
    expect(connection.send).toHaveBeenCalledTimes(1);
    expect(connection.send.mock.calls[0][0].session.audio.output).toEqual({
      format: { type: "audio/pcm", rate: 24000 }, voice: "marin", speed: 1.03,
    });
    connection.emit("session.updated", {});
    connection.emit("session.updated", {});
    expect(connection.send).toHaveBeenCalledTimes(2);
    const request = connection.send.mock.calls[1][0].response;
    expect(request.conversation).toBe("none");
    expect(request.input).toEqual([{ type: "message", role: "user", content: [{ type: "input_text", text }] }]);
    connection.emit("response.output_audio.delta", { delta: Buffer.from([1, 2]).toString("base64") });
    connection.emit("response.output_audio.delta", { delta: Buffer.from([3, 4]).toString("base64") });
    connection.emit("response.output_audio_transcript.done", { transcript: text });
    connection.emit("response.done", { response: { status: "completed" } });
    const actual = await result;
    expect(actual.wav.subarray(44)).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(actual.transcript).toBe(text);
    expect(connection.socket.terminate).toHaveBeenCalledOnce();
  });
  it.each(["failed", "incomplete", "cancelled"])("rejects partial audio when response status is %s", async status => {
    const { result, connection } = setup();
    connection.emit("response.output_audio.delta", { delta: "AQI=" });
    connection.emit("response.done", { response: { status } });
    await expect(result).rejects.toThrow("正常に完了しませんでした");
    expect(connection.socket.terminate).toHaveBeenCalledOnce();
  });
  it("rejects completion without audio or transcript", async () => {
    const { result, connection } = setup();
    connection.emit("response.done", { response: { status: "completed" } });
    await expect(result).rejects.toThrow("空・不正");
  });
  it("fails promptly when the server closes before completion", async () => {
    const { result, connection } = setup();
    connection.socket.emit("close");
    await expect(result).rejects.toThrow("接続が切れました");
  });
  it("closes a stalled connection at the deadline", async () => {
    vi.useFakeTimers();
    const { result, connection } = setup(100);
    const assertion = expect(result).rejects.toThrow("タイムアウト");
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(connection.socket.terminate).toHaveBeenCalledOnce();
  });
  it("does not expose raw API error messages", async () => {
    const { result, connection } = setup();
    connection.emit("error", { error: { code: "model_not_found" }, message: "private request body" });
    await expect(result).rejects.toThrow("model_not_found");
    await expect(result).rejects.not.toThrow("private request body");
  });
  it("rejects an empty script without opening a connection", async () => {
    await expect(new OpenAiRealtimeSpeech("test", profile).generate(" ")).rejects.toThrow("空");
    expect(mocks.connections).toHaveLength(0);
  });
});

describe("PCM WAV container", () => {
  it("writes a playable 24 kHz, mono, 16 bit WAV header", () => {
    const wav = pcmToWav(Buffer.from([0, 0, 255, 127]));
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(4)).toBe(40);
    expect(wav.toString("ascii", 8, 16)).toBe("WAVEfmt ");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(4);
  });
  it.each([Buffer.alloc(0), Buffer.from([1])])("rejects empty or misaligned PCM", pcm => {
    expect(() => pcmToWav(pcm)).toThrow("不正");
  });
});
