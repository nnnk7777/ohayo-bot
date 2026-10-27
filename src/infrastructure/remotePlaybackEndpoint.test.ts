import { mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRemotePlaybackServer,
  RemotePlaybackLimiter,
  sha256Token,
  tokenMatches,
  type RemotePlaybackConfig,
} from "./remotePlaybackEndpoint.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe("remote playback authorization", () => {
  it("compares the token using its SHA-256 hash", () => {
    const hash = sha256Token("secret-value");
    expect(tokenMatches("secret-value", hash)).toBe(true);
    expect(tokenMatches("wrong-value", hash)).toBe(false);
  });

  it("accepts only the allowed IP, POST path, JSON action, and token", async () => {
    const trigger = vi.fn();
    const config = await testConfig();
    const server = createRemotePlaybackServer(config, trigger, () => undefined);
    await listen(server);
    const port = addressPort(server);

    expect((await send(port, "POST", "/v1/play", { action: "play", token: "test-token" })).status).toBe(202);
    expect(trigger).toHaveBeenCalledTimes(1);

    expect((await send(port, "GET", "/v1/play", { action: "play", token: "test-token" })).status).toBe(404);
    expect((await send(port, "POST", "/v1/other", { action: "play", token: "test-token" })).status).toBe(404);
    expect((await send(port, "POST", "/v1/play", { action: "other", token: "test-token" })).status).toBe(404);
    expect((await send(port, "POST", "/v1/play", { action: "play", token: "wrong" })).status).toBe(404);
    expect(trigger).toHaveBeenCalledTimes(1);
    await close(server);
  });

  it("rejects an otherwise valid request from a different IP", async () => {
    const trigger = vi.fn();
    const config = { ...(await testConfig()), allowedIp: "192.0.2.10" };
    const server = createRemotePlaybackServer(config, trigger, () => undefined);
    await listen(server);
    const result = await send(addressPort(server), "POST", "/v1/play", { action: "play", token: "test-token" });
    expect(result.status).toBe(404);
    expect(trigger).not.toHaveBeenCalled();
    await close(server);
  });

  it("enforces the persisted cooldown and daily limit", async () => {
    const directory = await temporaryDirectory();
    let now = Date.parse("2026-09-19T00:00:00+09:00");
    const limiter = new RemotePlaybackLimiter({
      cooldownSeconds: 600,
      dailyLimit: 2,
      statePath: join(directory, "state.json"),
      timeZone: "Asia/Tokyo",
    }, () => now);

    expect(await limiter.checkAndRecord()).toEqual({ allowed: true });
    now += 60_000;
    expect(await limiter.checkAndRecord()).toMatchObject({ allowed: false, reason: "cooldown" });
    now += 600_000;
    expect(await limiter.checkAndRecord()).toEqual({ allowed: true });
    now += 600_000;
    expect(await limiter.checkAndRecord()).toMatchObject({ allowed: false, reason: "daily_limit" });
  });
});

async function testConfig(): Promise<RemotePlaybackConfig> {
  const directory = await temporaryDirectory();
  return {
    host: "127.0.0.1",
    port: 8765,
    allowedIp: "127.0.0.1",
    tokenSha256: sha256Token("test-token"),
    cooldownSeconds: 600,
    dailyLimit: 6,
    statePath: join(directory, "state.json"),
    timeZone: "Asia/Tokyo",
  };
}

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "ohayo-remote-playback-"));
  temporaryDirectories.push(path);
  return path;
}

function listen(server: ReturnType<typeof createRemotePlaybackServer>): Promise<void> {
  return new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
}

function close(server: ReturnType<typeof createRemotePlaybackServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  });
}

function addressPort(server: ReturnType<typeof createRemotePlaybackServer>): number {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("テストサーバーのポートを取得できません。");
  return address.port;
}

function send(port: number, method: string, path: string, body: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const outgoing = request({ hostname: "127.0.0.1", port, method, path, headers: {
      "Connection": "close",
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    } }, incoming => {
      const chunks: Buffer[] = [];
      incoming.on("data", chunk => chunks.push(Buffer.from(chunk)));
      incoming.on("end", () => resolve({ status: incoming.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    outgoing.on("error", reject);
    outgoing.end(payload);
  });
}
