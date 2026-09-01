import { describe, expect, it } from "vitest";
import { morningBriefingProfile } from "./briefingProfile.js";

describe("morningBriefingProfile", () => {
  it("事実に基づく原稿と、控えめなしめを求める", () => {
    expect(morningBriefingProfile.model).toMatch(/\S/);
    expect(morningBriefingProfile.instructions).toContain("JSONにない情報は推測・補完しない");
    expect(morningBriefingProfile.instructions).toContain("本文の最後は必ず");
    expect(morningBriefingProfile.instructions).toContain("控えめな見送り");
    expect(morningBriefingProfile.instructions).toContain("毎回違う言い回しを作る必要はありません");
  });
});
