import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ohayo-runner-"));
  roots.push(root);
  const home = join(root, "home");
  const prefix = join(root, "usr");
  const state = join(home, ".local/state/ohayo-bot");
  mkdirSync(state, { recursive: true });
  mkdirSync(join(home, "ohayo-bot/assets/audio"), { recursive: true });
  mkdirSync(join(prefix, "bin"), { recursive: true });
  mkdirSync(join(prefix, "lib"), { recursive: true });
  writeFileSync(join(prefix, "lib/libtermux-exec-ld-preload.so"), "");
  writeFileSync(join(home, "ohayo-bot/assets/audio/generic-closing-zero-lead.wav"), "");
  for (const command of ["mkdir", "mv", "date", "rm", "chmod"]) {
    const binary = execFileSync("which", [command], { encoding: "utf8" }).trim();
    execFileSync("ln", ["-s", binary, join(prefix, "bin", command)]);
  }
  execFileSync("ln", ["-s", "/bin/sh", join(prefix, "bin/sh")]);
  function stub(name: string, body: string) {
    const path = join(prefix, "bin", name);
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o700);
  }
  stub("flock", "exit 0");
  stub("pnpm", 'echo "mock run"; exit "${MOCK_RUN_EXIT:-0}"');
  stub("termux-media-player", "exit 0");
  stub("ffmpeg", "exit 0");
  stub("ffprobe", "exit 0");
  stub("timeout", 'test "$1 $2 $3" = "-k 2 8" || exit 64; shift 3; exec "$@"');
  const source = readFileSync(new URL("../../scripts/run-ohayo-bot-cron", import.meta.url), "utf8")
    .replaceAll("/data/data/com.termux/files/home", home)
    .replaceAll("/data/data/com.termux/files/usr", prefix)
    // The platform loader itself is not part of the shell behavior under test.
    .replace('export PATH="$OHAYO_PATH" LD_PRELOAD="$OHAYO_LD_PRELOAD"', 'export PATH="$OHAYO_PATH"');
  const path = join(root, "runner");
  writeFileSync(path, source);
  return {
    state, prefix, stub,
    run: (args: string[] = [], extra: Record<string, string> = {}) =>
      spawnSync("/bin/sh", [path, ...args], { encoding: "utf8", env: { ...process.env, ...extra } }),
  };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("Termux briefing runner", () => {
  it("fails its prerequisite check when an executable is missing", () => {
    const f = fixture();
    rmSync(join(f.prefix, "bin/ffprobe"));
    const result = f.run(["--check"]);
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("CHECK_OK");
  });
  it("preserves a failed run after the next successful run", () => {
    const f = fixture();
    expect(f.run(["--now"], { MOCK_RUN_EXIT: "1" }).status).toBe(1);
    const failed = readFileSync(join(f.state, "current-run.log"), "utf8");
    expect(f.run(["--now"]).status).toBe(0);
    expect(readFileSync(join(f.state, "last-failed-run.log"), "utf8")).toBe(failed);
    expect(existsSync(join(f.state, "current-run.log"))).toBe(false);
  });
  it("does not overwrite the active run log or stop its player when locked", () => {
    const f = fixture();
    writeFileSync(join(f.state, "current-run.log"), "active run");
    f.stub("flock", "exit 75");
    f.stub("termux-media-player", 'echo stop > "' + join(f.state, "player-stopped") + '"');
    expect(f.run(["--now"]).status).toBe(75);
    expect(readFileSync(join(f.state, "current-run.log"), "utf8")).toBe("active run");
    expect(existsSync(join(f.state, "player-stopped"))).toBe(false);
  });
  it("continues briefing generation when the player stop times out", () => {
    const f = fixture();
    f.stub("timeout", 'test "$1 $2 $3" = "-k 2 8" || exit 64; exit 124');
    expect(f.run(["--now"]).status).toBe(0);
    expect(readFileSync(join(f.state, "cron-status.log"), "utf8")).toContain("OK source=now");
  });
  it("waits for 08:30 only for scheduled runs, clearing inherited timing for --now", () => {
    const f = fixture();
    f.stub("pnpm", 'echo "play_at=${SPEECH_PLAY_AT:-immediate}"; exit 1');
    f.run([]);
    expect(readFileSync(join(f.state, "current-run.log"), "utf8")).toContain("play_at=08:30");
    f.run(["--now"], { SPEECH_PLAY_AT: "08:30" });
    expect(readFileSync(join(f.state, "current-run.log"), "utf8")).toContain("play_at=immediate");
  });
});

describe("Termux service process identity", () => {
  it.each([
    { executable: "/termux/bin/runsvdir", argv: ["/termux/bin/runsvdir", "/services"], status: 0 },
    { executable: "/apex/com.android.runtime/bin/linker64", argv: ["/termux/bin/runsvdir", "/termux/bin/runsvdir", "/services"], status: 0 },
    { executable: "/apex/com.android.runtime/bin/linker64", argv: ["runsvdir", "/termux/bin/runsvdir", "/services"], status: 0 },
    { executable: "/apex/com.android.runtime/bin/linker64", argv: ["/termux/bin/node", "/termux/bin/node", "/services"], status: 1 },
    { executable: "/termux/bin/sleep", argv: ["/termux/bin/runsvdir", "/services"], status: 1 },
  ])("validates executable and linker argv: $executable $argv", ({ executable, argv, status }) => {
    const root = mkdtempSync(join(tmpdir(), "ohayo-process-"));
    roots.push(root);
    const proc = join(root, "proc", String(process.pid));
    mkdirSync(proc, { recursive: true });
    symlinkSync(executable, join(proc, "exe"));
    writeFileSync(join(proc, "cmdline"), argv.join("\0") + "\0");
    const source = readFileSync(new URL("../../scripts/ensure-ohayo-services", import.meta.url), "utf8");
    const helper = source.slice(source.indexOf("process_is() {"), source.indexOf("# A recycled PID"))
      .replaceAll("/proc/", `${root}/proc/`);
    expect(spawnSync("/bin/sh", ["-c", `${helper}\nprocess_is ${process.pid} /termux/bin/runsvdir`]).status).toBe(status);
  });
});
