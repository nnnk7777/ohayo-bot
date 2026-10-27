import "dotenv/config";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRemotePlaybackServer, type RemotePlaybackConfig } from "../infrastructure/remotePlaybackEndpoint.js";

const config = loadRemotePlaybackConfig();
await access(config.runnerPath, constants.X_OK);

const server = createRemotePlaybackServer(config, () => {
  const child = spawn(config.runnerPath, ["--now"], {
    detached: true,
    env: process.env,
    stdio: "ignore",
  });
  child.once("error", () => console.error("remote_playback runner_spawn_failed"));
  child.unref();
});

server.listen(config.port, config.host, () => {
  console.log(`remote_playback listening=${config.host}:${config.port} allowed_ip=${config.allowedIp}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

type CliConfig = RemotePlaybackConfig & { runnerPath: string };

function loadRemotePlaybackConfig(): CliConfig {
  return {
    host: process.env.REMOTE_PLAYBACK_HOST?.trim() || "0.0.0.0",
    port: integer("REMOTE_PLAYBACK_PORT", 8765),
    allowedIp: required("REMOTE_PLAYBACK_ALLOWED_IP"),
    tokenSha256: required("REMOTE_PLAYBACK_TOKEN_SHA256"),
    cooldownSeconds: integer("REMOTE_PLAYBACK_COOLDOWN_SECONDS", 180),
    dailyLimit: integer("REMOTE_PLAYBACK_DAILY_LIMIT", 6),
    statePath: process.env.REMOTE_PLAYBACK_STATE_PATH?.trim() ||
      "/data/data/com.termux/files/home/.local/state/ohayo-bot/remote-playback.json",
    timeZone: required("TIME_ZONE"),
    runnerPath: process.env.REMOTE_PLAYBACK_RUNNER_PATH?.trim() ||
      "/data/data/com.termux/files/home/bin/run-ohayo-bot-cron",
  };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`環境変数 ${name} を設定してください。`);
  return value;
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`環境変数 ${name} は整数にしてください。`);
  return value;
}
