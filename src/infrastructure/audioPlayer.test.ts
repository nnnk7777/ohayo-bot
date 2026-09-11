import { describe, expect, it } from "vitest";
import { parseTermuxPlaybackStatus, resolveAudioPlayerCommand } from "./audioPlayer.js";

describe("resolveAudioPlayerCommand", () => {
  it("自動選択ではmacOSにafplayを使う", () => {
    expect(resolveAudioPlayerCommand("auto", "darwin")).toBe("afplay");
  });

  it("自動選択ではLinuxにmpg123を使う", () => {
    expect(resolveAudioPlayerCommand("auto", "linux")).toBe("mpg123");
  });

  it("自動選択ではAndroidにtermux-media-playerを使う", () => {
    expect(resolveAudioPlayerCommand("auto", "android")).toBe("termux-media-player");
  });

  it("明示指定したプレイヤーをOSにかかわらず優先する", () => {
    expect(resolveAudioPlayerCommand("mpg123", "darwin")).toBe("mpg123");
    expect(resolveAudioPlayerCommand("termux-media-player", "linux")).toBe("termux-media-player");
  });

  it("未対応のOSでは自動選択を拒否する", () => {
    expect(() => resolveAudioPlayerCommand("auto", "win32")).toThrow("音声再生に対応していないOSです: win32");
  });
});

describe("parseTermuxPlaybackStatus", () => {
  it("再生中を判定する", () => {
    expect(parseTermuxPlaybackStatus("Track: briefing.mp3\nStatus: Playing")).toBe("playing");
  });

  it("一時停止中もファイルを保持する", () => {
    expect(parseTermuxPlaybackStatus("Track: briefing.mp3\nStatus: Paused")).toBe("playing");
  });

  it("トラックなしを再生終了と判定する", () => {
    expect(parseTermuxPlaybackStatus("No track currently!")).toBe("stopped");
  });

  it("不明な出力を区別する", () => {
    expect(parseTermuxPlaybackStatus("Termux:API is unavailable")).toBe("unknown");
  });
});
