import { describe, expect, it } from "vitest";
import { parseDetectedSilences } from "./audioProcessing.js";

describe("parseDetectedSilences", () => {
  it("ffmpegの無音検出結果を読み取る", () => {
    const output = [
      "[silencedetect] silence_start: 16.302875",
      "[silencedetect] silence_end: 16.824 | silence_duration: 0.521125",
    ].join("\n");
    expect(parseDetectedSilences(output)).toEqual([{
      startSeconds: 16.302875,
      endSeconds: 16.824,
      durationSeconds: 0.521125,
    }]);
  });
});
