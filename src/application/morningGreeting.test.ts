import { describe, expect, it } from "vitest";
import { ensureMorningGreeting } from "./morningGreeting.js";

describe("ensureMorningGreeting", () => {
  it("原稿の先頭に挨拶を追加する", () => {
    expect(ensureMorningGreeting("9月7日、東京はくもりです。")).toBe(
      "おはようございます。\n\n9月7日、東京はくもりです。",
    );
  });

  it("すでに挨拶で始まる場合は重複させない", () => {
    expect(ensureMorningGreeting("おはようございます。\n\n9月7日、東京はくもりです。")).toBe(
      "おはようございます。\n\n9月7日、東京はくもりです。",
    );
  });

  it("空の原稿は空のまま返す", () => {
    expect(ensureMorningGreeting("  ")).toBe("");
  });
});
