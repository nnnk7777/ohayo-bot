import { describe, expect, it } from "vitest";
import { morningBriefingProfile } from "./briefingProfile.js";

describe("morningBriefingProfile", () => {
  it("事実に基づく原稿と、控えめなしめを求める", () => {
    expect(morningBriefingProfile.model).toMatch(/\S/);
    expect(morningBriefingProfile.instructions).toContain("JSONにない情報は推測・補完しない");
    expect(morningBriefingProfile.instructions).toContain("本文は必ず「おはようございます。」で始めてください");
    expect(morningBriefingProfile.instructions).toContain("本文の最後はclosingに従って、自然な短い一文で締めてください");
    expect(morningBriefingProfile.instructions).toContain("targetDurationSeconds");
    expect(morningBriefingProfile.instructions).toContain("locationName");
    expect(morningBriefingProfile.instructions).toContain("現在の気温は19度です");
    expect(morningBriefingProfile.instructions).toContain("agenda.itemsに予定がある場合は");
    expect(morningBriefingProfile.instructions).toContain("briefingHints");
    expect(morningBriefingProfile.instructions).toContain("titleとdescriptionを優先してください");
    expect(morningBriefingProfile.instructions).toContain("予約確認の可能性があります");
    expect(morningBriefingProfile.instructions).toContain("家族やペットなどの個人的な背景");
    expect(morningBriefingProfile.instructions).toContain("都道府県名または都市名だけを表す");
    expect(morningBriefingProfile.instructions).toContain("seasonalAdvice");
    expect(morningBriefingProfile.instructions).toContain("年は含めないでください");
    expect(morningBriefingProfile.instructions).toContain("closing.kind");
    expect(morningBriefingProfile.instructions).toContain("closing.kindがschedule-contextの場合");
    expect(morningBriefingProfile.instructions).toContain("予定の確認・準備・管理を促す表現");
    expect(morningBriefingProfile.instructions).toContain("自然な見送りの言葉で締めてください");
    expect(morningBriefingProfile.instructions).toContain("weekdayFocus");
    expect(morningBriefingProfile.instructions).toContain("選定理由は本文で説明せず");
    expect(morningBriefingProfile.instructions).toContain("今日の予定として一度だけ述べ");
    expect(morningBriefingProfile.instructions).toContain("不自然で内容を伴わない定型句は使わない");
    expect(morningBriefingProfile.instructions).toContain("毎回違う言い回しを作る必要はありません");
    expect(morningBriefingProfile.instructions).toContain("commuteがある場合だけ通勤路線について触れてください");
    expect(morningBriefingProfile.instructions).toContain("stateがunknownなら");
    expect(morningBriefingProfile.instructions).toContain("通常運行・平常運転など通勤路線の状態に一切触れない");
  });
});
