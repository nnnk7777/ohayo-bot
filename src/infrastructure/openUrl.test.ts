import { describe, expect, it } from "vitest";
import { resolveOpenUrlCommand } from "./openUrl.js";

describe("resolveOpenUrlCommand", () => {
  const url = "https://example.com/auth";

  it("macOSではopenを使う", () => {
    expect(resolveOpenUrlCommand(url, "darwin")).toEqual({ command: "open", args: [url] });
  });

  it("Linuxではxdg-openを使う", () => {
    expect(resolveOpenUrlCommand(url, "linux")).toEqual({ command: "xdg-open", args: [url] });
  });

  it("Androidではtermux-open-urlを使う", () => {
    expect(resolveOpenUrlCommand(url, "android")).toEqual({ command: "termux-open-url", args: [url] });
  });

  it("未対応のOSでは拒否する", () => {
    expect(() => resolveOpenUrlCommand(url, "win32")).toThrow("ブラウザ起動に対応していないOSです: win32");
  });
});
