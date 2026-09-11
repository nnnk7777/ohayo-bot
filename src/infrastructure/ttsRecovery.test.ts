import { describe, expect, it } from "vitest";
import {
  assessTtsTranscript,
  bestTextMatchScore,
  calculateSeamAdjustment,
  extractFinalSentences,
} from "./ttsRecovery.js";

describe("extractFinalSentences", () => {
  it("最後とその一つ前の文を取り出す", () => {
    expect(extractFinalSentences("予定はありません。朝をゆっくり使えそうです。よい朝をお過ごしください。"))
      .toEqual({ closing: "よい朝をお過ごしください。", preceding: "朝をゆっくり使えそうです。" });
  });
});

describe("assessTtsTranscript", () => {
  const expected = "予定はありません。朝をゆっくり使えそうです。よい朝をお過ごしください。";

  it("表記揺れがあっても締めまで読まれたと判定する", () => {
    const result = assessTtsTranscript(expected, "予定はありません。朝をゆっくり使えそうです。良い朝をお過ごしください。 ");
    expect(result.hasClosing).toBe(true);
    expect(result.canAppendFallbackClosing).toBe(false);
  });

  it("一つ前の文まで完全で締めだけ欠けた場合は連結可能と判定する", () => {
    const result = assessTtsTranscript(expected, "予定はありません。朝をゆっくり使えそうです。");
    expect(result.hasClosing).toBe(false);
    expect(result.canAppendFallbackClosing).toBe(true);
  });

  it("一つ前の文も欠けた場合は連結不可と判定する", () => {
    const result = assessTtsTranscript(expected, "予定はありません。");
    expect(result.hasClosing).toBe(false);
    expect(result.canAppendFallbackClosing).toBe(false);
  });
});

describe("bestTextMatchScore", () => {
  it("多少の文字起こし誤差を許容する", () => {
    expect(bestTextMatchScore("それでは、今日もよい一日をお過ごしください。", "それでは今日も良い1日をお過ごしください。"))
      .toBe(1);
  });
});

describe("calculateSeamAdjustment", () => {
  it("不足する無音だけを追加する", () => {
    expect(calculateSeamAdjustment(300, 0)).toEqual({ padMs: 300, trimMs: 0 });
  });

  it("素材側の先頭無音も合算する", () => {
    expect(calculateSeamAdjustment(520, 60)).toEqual({ padMs: 20, trimMs: 0 });
  });

  it("長すぎる無音だけを削る", () => {
    expect(calculateSeamAdjustment(800, 0)).toEqual({ padMs: 0, trimMs: 200 });
  });
});
