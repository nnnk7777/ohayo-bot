import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiLiveSpeech, trimPcmSilence } from "./liveSpeech.js";

const mocks = vi.hoisted(() => ({ sockets: [] as unknown[] }));
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  return { default: class extends EventEmitter {
    static OPEN = 1;
    readyState = 0;
    send = vi.fn();
    close = vi.fn(() => this.emit("close"));
    terminate = vi.fn(() => this.emit("close"));
    constructor() { super(); mocks.sockets.push(this); }
  } };
});
type Socket = EventEmitter & { readyState: number; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> };
const profile = { model: "gpt-live-1", voice: "harema", instructions: "穏やかな口調" };
const text = "おはようございます。それでは、よい一日を。";
const audio = (sample = 1000, samples = 2400) => {
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(sample, i);
  return pcm;
};
function setup(timeoutMs?: number) {
  const result = new OpenAiLiveSpeech("test-key", profile).generate(text, timeoutMs);
  const socket = mocks.sockets.at(-1) as Socket;
  const emit = (event: object) => socket.emit("message", Buffer.from(JSON.stringify(event)));
  function start() { socket.readyState = 1; socket.emit("open"); emit({ type: "session.started" }); }
  const sent = () => socket.send.mock.calls.map(([raw]) => JSON.parse(raw));
  const say = () => {
    emit({ type: "session.output_audio.delta", delta: audio().toString("base64") });
    emit({ type: "session.output_transcript.delta", delta: text });
  };
  return { result, socket, emit, start, sent, say };
}
beforeEach(() => { vi.useFakeTimers(); mocks.sockets.length = 0; });
afterEach(() => vi.useRealTimers());

describe("Live speech generation", () => {
  it("uses the selected voice and full script, streams silence, then collects final usage before completing", async () => {
    const { result, socket, emit, start, sent, say } = setup();
    start();
    emit({ type: "session.started" });
    const config = sent()[0].session;
    expect(config).toMatchObject({ model: profile.model, instructions: profile.instructions, store: false,
      delegation: { type: "client" }, audio: { format: { type: "audio/pcm", rate: 24000 }, output: { voice: "harema" } } });
    expect(config.input[0].role).toBe("developer");
    expect(config.input[0].content[0].text).not.toContain(text);
    expect(config.input[1]).toEqual({ type: "message", role: "user", content: [{ type: "input_text", text }] });
    expect(sent().filter(e => e.type === "session.commentary.append")).toHaveLength(1);
    say();
    await vi.advanceTimersByTimeAsync(5900);
    expect(sent().some(e => e.type === "session.close")).toBe(false);
    const input = sent().find(e => e.type === "session.input_audio.append");
    expect(Buffer.from(input.audio, "base64")).toEqual(Buffer.alloc(4800));
    // Another phrase resets the silence timer rather than cutting a sentence short.
    emit({ type: "session.output_audio.delta", delta: audio().toString("base64") });
    await vi.advanceTimersByTimeAsync(6000);
    expect(sent().filter(e => e.type === "session.close")).toHaveLength(1);
    expect(socket.close).not.toHaveBeenCalled();
    const count = sent().length;
    await vi.advanceTimersByTimeAsync(100);
    expect(sent()).toHaveLength(count);
    emit({ type: "session.closed", usage: { seconds: 12 } });
    const actual = await result;
    expect(actual.sessionSeconds).toBe(12);
    expect(actual.transcript).toBe(text);
    expect(actual.wav.subarray(44)).toEqual(Buffer.concat([audio(), audio()]));
    expect(socket.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects a timeout even if partial speech was received and the server closes gracefully", async () => {
    const { result, emit, start, say } = setup(8000);
    const assertion = expect(result).rejects.toThrow("タイムアウト");
    start(); say();
    await vi.advanceTimersByTimeAsync(3000);
    emit({ type: "session.closed", usage: { seconds: 3 } });
    await assertion;
  });
  it("terminates when the session does not acknowledge closure", async () => {
    const { result, socket, start, say } = setup();
    const assertion = expect(result).rejects.toThrow("終了を確認できません");
    start(); say();
    await vi.advanceTimersByTimeAsync(11_000);
    await assertion;
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not accept silence as speech and closes an unresponsive session", async () => {
    const { result, emit, start, sent } = setup();
    const assertion = expect(result).rejects.toThrow("発話を開始しません");
    start(); emit({ type: "session.output_audio.delta", delta: audio(0).toString("base64") });
    await vi.advanceTimersByTimeAsync(18_000);
    expect(sent().at(-1).type).toBe("session.close");
    emit({ type: "session.closed", usage: { seconds: 18 } });
    await assertion;
  });
  it("bounds a connection that never starts", async () => {
    const { result, socket } = setup(7000);
    const assertion = expect(result).rejects.toThrow("タイムアウト");
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
    expect(socket.terminate).toHaveBeenCalledOnce();
  });
  it("does not accept truncated output after a transport disconnect", async () => {
    const { result, socket, start, say } = setup();
    start(); say(); socket.emit("close");
    await expect(result).rejects.toThrow("接続が切れました");
  });
  it("rejects an unexpected server-side close instead of treating it as a completed reading", async () => {
    const { result, emit, start, say } = setup();
    start(); say(); emit({ type: "session.closed", usage: { seconds: 1 } });
    await expect(result).rejects.toThrow("途中で終了");
  });
  it("does not expose API error text or arbitrary codes", async () => {
    const { result, emit } = setup();
    emit({ type: "error", error: { code: "private request content", message: "secret" } });
    await expect(result).rejects.toThrow("API_ERROR");
    await expect(result).rejects.not.toThrow("secret");
    await expect(result).rejects.not.toThrow("private request content");
  });
  it("rejects malformed audio", async () => {
    const { result, emit, start } = setup(); start();
    emit({ type: "session.output_audio.delta", delta: "!not-base64!" });
    await expect(result).rejects.toThrow("応答形式");
  });
  it.each([undefined, { seconds: "12" }, { seconds: -1 }])("rejects an invalid final usage report: %j", async usage => {
    const { result, emit, start, say } = setup();
    const assertion = expect(result).rejects.toThrow("不正");
    start(); say(); await vi.advanceTimersByTimeAsync(6000);
    emit({ type: "session.closed", usage });
    await assertion;
  });
  it("rejects audio without a transcript", async () => {
    const { result, emit, start } = setup();
    const assertion = expect(result).rejects.toThrow("空・不正");
    start(); emit({ type: "session.output_audio.delta", delta: audio().toString("base64") });
    await vi.advanceTimersByTimeAsync(6000);
    emit({ type: "session.closed", usage: { seconds: 6 } });
    await assertion;
  });
  it("handles handshake failures without exposing server response bodies", async () => {
    const { result, socket } = setup();
    const resume = vi.fn();
    socket.emit("unexpected-response", {}, { statusCode: 403, resume });
    await expect(result).rejects.toThrow("403");
    expect(resume).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["", "   "])("rejects empty scripts before connecting", async value => {
    await expect(new OpenAiLiveSpeech("test-key", profile).generate(value)).rejects.toThrow("空");
    expect(mocks.sockets).toHaveLength(0);
  });
});

describe("PCM waiting silence removal", () => {
  it("keeps internal pauses and adds margin around quiet leading and trailing speech", () => {
    const pcm = Buffer.concat([audio(0, 24000), audio(), audio(0, 24000), audio(-1000), audio(0, 24000)]);
    const trimmed = trimPcmSilence(pcm);
    expect(trimmed).toEqual(Buffer.concat([audio(0, 4800), audio(), audio(0, 24000), audio(-1000), audio(0, 12000)]));
  });
  it.each([Buffer.alloc(0), Buffer.alloc(1), Buffer.alloc(4800)])("rejects empty, misaligned, or silent audio", pcm => {
    expect(() => trimPcmSilence(pcm)).toThrow();
  });
});
