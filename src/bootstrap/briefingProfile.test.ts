import { describe, expect, it } from "vitest";
import { morningBriefingProfile } from "./briefingProfile.js";

describe("morningBriefingProfile", () => {
  it("事実に基づく原稿と、控えめなしめを求める", () => {
    expect(morningBriefingProfile.model).toMatch(/\S/);
    expect(morningBriefingProfile.instructions).toContain("JSONにない情報は推測・補完しない");
    expect(morningBriefingProfile.instructions).toContain("本文の最後は必ず、自然な短い一文で締めてください");
    expect(morningBriefingProfile.instructions).toContain("targetDurationSeconds");
    expect(morningBriefingProfile.instructions).toContain("locationName");
    expect(morningBriefingProfile.instructions).toContain("現在の気温は19度です");
    expect(morningBriefingProfile.instructions).toContain("weekdayFocus");
    expect(morningBriefingProfile.instructions).toContain("不自然で内容を伴わない定型句は使わない");
    expect(morningBriefingProfile.instructions).toContain("毎回違う言い回しを作る必要はありません");
  });
});
