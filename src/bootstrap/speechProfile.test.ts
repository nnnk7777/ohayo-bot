import { describe, expect, it } from "vitest";
import { openAiTtsProfile } from "./speechProfile.js";

describe("openAiTtsProfile", () => {
  it("話し方の指示に対応したTTSモデルと採用ボイスを使う", () => {
    expect(openAiTtsProfile.model).toBe("gpt-4o-mini-tts");
    expect(openAiTtsProfile.voice).toBe("marin");
  });

  it("末尾まで読み上げるよう明示する", () => {
    expect(openAiTtsProfile.instructions).toContain("【最重要】");
    expect(openAiTtsProfile.instructions).toContain("最後の句点まで一切省略せず");
    expect(openAiTtsProfile.instructions).toContain("末尾の挨拶や見送りの言葉を省略したりしない");
    expect(openAiTtsProfile.instructions).toContain("最後の一文を完全に発話し終えてから終了");
  });

  it("朝らしい明るく軽やかな声のトーンを求める", () => {
    expect(openAiTtsProfile.instructions).toContain("明るく軽やかな、やや高めの声のトーン");
    expect(openAiTtsProfile.instructions).toContain("暗く沈んだ印象や、低く重たい話し方にはしない");
    expect(openAiTtsProfile.instructions).toContain("過度に元気づけたり、演技的になったりはしない");
  });
});
