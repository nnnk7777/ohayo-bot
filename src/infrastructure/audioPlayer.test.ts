import { describe, expect, it } from "vitest";
import { resolveAudioPlayerCommand } from "./audioPlayer.js";

describe("resolveAudioPlayerCommand", () => {
  it("自動選択ではmacOSにafplayを使う", () => {
    expect(resolveAudioPlayerCommand("auto", "darwin")).toBe("afplay");
  });

  it("自動選択ではLinuxにmpg123を使う", () => {
    expect(resolveAudioPlayerCommand("auto", "linux")).toBe("mpg123");
  });

  it("明示指定したプレイヤーをOSにかかわらず優先する", () => {
    expect(resolveAudioPlayerCommand("mpg123", "darwin")).toBe("mpg123");
  });

  it("未対応のOSでは自動選択を拒否する", () => {
    expect(() => resolveAudioPlayerCommand("auto", "win32")).toThrow("音声再生に対応していないOSです: win32");
  });
});
