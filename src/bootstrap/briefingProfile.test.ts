import { describe, expect, it } from "vitest";
import { morningBriefingProfile } from "./briefingProfile.js";

describe("morningBriefingProfile", () => {
  it("今日の予定がない日は、先の予定の補足があっても予定なしの案内を求める", () => {
    expect(morningBriefingProfile.instructions).toContain(
      'agendaがない、またはagenda.itemsが空の場合は、「今日は、予定のお知らせはありません。」と一度伝えてください。',
    );
    expect(morningBriefingProfile.instructions).toContain(
      "weekdayFocusに今日以外の予定があっても、今日の予定がないことは伝えてください。",
    );
    expect(morningBriefingProfile.instructions).not.toContain("予定がないことは、わざわざ言わない");
  });

  it("事実に基づく原稿と、控えめなしめを求める", () => {
    expect(morningBriefingProfile.model).toMatch(/\S/);
    expect(morningBriefingProfile.instructions).toContain("JSONにない情報は推測・補完しない");
    expect(morningBriefingProfile.instructions).toContain("本文は必ず「おはようございます。」で始めてください");
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
    expect(morningBriefingProfile.instructions).toContain("weekdayFocus");
    expect(morningBriefingProfile.instructions).toContain("選定理由は本文で説明せず");
    expect(morningBriefingProfile.instructions).toContain("今日の予定として一度だけ述べ");
    expect(morningBriefingProfile.instructions).toContain("不自然で内容を伴わない定型句は使わない");
    expect(morningBriefingProfile.instructions).toContain("commuteがある場合だけ通勤路線について触れてください");
    expect(morningBriefingProfile.instructions).toContain("stateがunknownなら");
    expect(morningBriefingProfile.instructions).toContain("通常運行・平常運転など通勤路線の状態に一切触れない");
  });
});
