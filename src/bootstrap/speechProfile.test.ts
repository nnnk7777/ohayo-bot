import { describe, expect, it } from "vitest";
import { openAiTtsProfile } from "./speechProfile.js";

describe("openAiTtsProfile", () => {
  it("末尾まで読み上げるよう明示する", () => {
    expect(openAiTtsProfile.instructions).toContain("最後の一文を読み落とさず");
  });
});
