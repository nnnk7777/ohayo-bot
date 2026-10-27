import { createHash, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import { dirname } from "node:path";
import { DateTime } from "luxon";

const MAX_BODY_BYTES = 1024;

export type RemotePlaybackConfig = {
  host: string;
  port: number;
  allowedIp: string;
  tokenSha256: string;
  cooldownSeconds: number;
  dailyLimit: number;
  statePath: string;
  timeZone: string;
};

type PlaybackState = {
  date: string;
  acceptedAt: number[];
};

type LimitResult =
  | { allowed: true }
  | { allowed: false; reason: "cooldown" | "daily_limit"; retryAfterSeconds: number };

export function validateRemotePlaybackConfig(config: RemotePlaybackConfig): void {
  if (isIP(config.allowedIp) !== 4) throw new Error("REMOTE_PLAYBACK_ALLOWED_IP はIPv4アドレスで指定してください。");
  if (!/^[0-9a-f]{64}$/i.test(config.tokenSha256)) {
    throw new Error("REMOTE_PLAYBACK_TOKEN_SHA256 はSHA-256の16進数64文字で指定してください。");
  }
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) {
    throw new Error("REMOTE_PLAYBACK_PORT は1024〜65535の整数にしてください。");
  }
  if (!Number.isInteger(config.cooldownSeconds) || config.cooldownSeconds < 60) {
    throw new Error("REMOTE_PLAYBACK_COOLDOWN_SECONDS は60以上の整数にしてください。");
  }
  if (!Number.isInteger(config.dailyLimit) || config.dailyLimit < 1) {
    throw new Error("REMOTE_PLAYBACK_DAILY_LIMIT は1以上の整数にしてください。");
  }
  const zone = DateTime.now().setZone(config.timeZone);
  if (!zone.isValid) throw new Error("REMOTE_PLAYBACK用のTIME_ZONEが不正です。");
}

export function sha256Token(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokenMatches(token: string, expectedSha256: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(expectedSha256)) return false;
  const actual = createHash("sha256").update(token, "utf8").digest();
  const expected = Buffer.from(expectedSha256, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class RemotePlaybackLimiter {
  constructor(
    private readonly config: Pick<RemotePlaybackConfig, "cooldownSeconds" | "dailyLimit" | "statePath" | "timeZone">,
    private readonly now: () => number = Date.now,
  ) {}

  async checkAndRecord(): Promise<LimitResult> {
    const now = this.now();
    const date = DateTime.fromMillis(now).setZone(this.config.timeZone).toISODate();
    if (!date) throw new Error("現在日付を判定できませんでした。");
    const previous = await this.readState();
    const acceptedAt = previous?.date === date ? previous.acceptedAt : [];
    const lastAccepted = acceptedAt.at(-1);
    if (lastAccepted !== undefined) {
      const remainingMs = this.config.cooldownSeconds * 1000 - (now - lastAccepted);
      if (remainingMs > 0) {
        return { allowed: false, reason: "cooldown", retryAfterSeconds: Math.ceil(remainingMs / 1000) };
      }
    }
    if (acceptedAt.length >= this.config.dailyLimit) {
      const tomorrow = DateTime.fromMillis(now).setZone(this.config.timeZone).plus({ days: 1 }).startOf("day").toMillis();
      return { allowed: false, reason: "daily_limit", retryAfterSeconds: Math.max(1, Math.ceil((tomorrow - now) / 1000)) };
    }
    await this.writeState({ date, acceptedAt: [...acceptedAt, now] });
    return { allowed: true };
  }

  private async readState(): Promise<PlaybackState | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.config.statePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    const value = JSON.parse(raw) as Partial<PlaybackState>;
    if (typeof value.date !== "string" || !Array.isArray(value.acceptedAt) ||
      !value.acceptedAt.every(item => typeof item === "number" && Number.isFinite(item))) {
      throw new Error("再生リクエストの状態ファイルが不正です。");
    }
    return { date: value.date, acceptedAt: value.acceptedAt };
  }

  private async writeState(state: PlaybackState): Promise<void> {
    const directory = dirname(this.config.statePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const temporary = `${this.config.statePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await rename(temporary, this.config.statePath);
    await chmod(this.config.statePath, 0o600);
  }
}

export function createRemotePlaybackServer(
  config: RemotePlaybackConfig,
  triggerPlayback: () => void | Promise<void>,
  log: (message: string) => void = console.log,
): Server {
  validateRemotePlaybackConfig(config);
  const limiter = new RemotePlaybackLimiter(config);
  const server = createServer((request, response) => {
    void handleRequest(request, response, config, limiter, triggerPlayback, log);
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: RemotePlaybackConfig,
  limiter: RemotePlaybackLimiter,
  triggerPlayback: () => void | Promise<void>,
  log: (message: string) => void,
): Promise<void> {
  const remoteIp = normalizeIp(request.socket.remoteAddress);
  try {
    if (remoteIp !== config.allowedIp || request.method !== "POST" || request.url !== "/v1/play") {
      log(`remote_playback rejected=route_or_ip remote=${remoteIp || "unknown"}`);
      request.resume();
      sendJson(response, 404, { ok: false });
      return;
    }
    const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") {
      log(`remote_playback rejected=content_type remote=${remoteIp}`);
      request.resume();
      sendJson(response, 415, { ok: false });
      return;
    }
    const contentLength = Number(request.headers["content-length"] ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      log(`remote_playback rejected=body_too_large remote=${remoteIp}`);
      request.resume();
      sendJson(response, 413, { ok: false });
      return;
    }
    const body = await readJsonBody(request);
    if (!isAuthorizedBody(body, config.tokenSha256)) {
      log(`remote_playback rejected=credentials remote=${remoteIp}`);
      sendJson(response, 404, { ok: false });
      return;
    }
    const limit = await limiter.checkAndRecord();
    if (!limit.allowed) {
      log(`remote_playback rejected=${limit.reason} remote=${remoteIp}`);
      response.setHeader("Retry-After", String(limit.retryAfterSeconds));
      sendJson(response, 429, { ok: false, status: limit.reason });
      return;
    }
    await triggerPlayback();
    log(`remote_playback accepted remote=${remoteIp}`);
    sendJson(response, 202, { ok: true, status: "accepted" });
  } catch (error) {
    const code = error instanceof Error && error.message === "body_too_large" ? 413 : 503;
    log(`remote_playback rejected=internal remote=${remoteIp || "unknown"}`);
    sendJson(response, code, { ok: false });
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("body_too_large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isAuthorizedBody(body: unknown, tokenSha256: string): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== "action" || keys[1] !== "token") return false;
  return record.action === "play" && typeof record.token === "string" && tokenMatches(record.token, tokenSha256);
}

function normalizeIp(address: string | undefined): string | undefined {
  return address?.startsWith("::ffff:") ? address.slice(7) : address;
}

function sendJson(response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  if (response.headersSent) return;
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(`${JSON.stringify(body)}\n`);
}
