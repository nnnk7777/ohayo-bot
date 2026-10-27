import { describe, expect, it } from "vitest";
import { morningBriefingProfile } from "./briefingProfile.js";

describe("morningBriefingProfile", () => {
  it("複数予定でも識別できる名前を残し、未定の時刻を補わない", () => {
    expect(morningBriefingProfile.instructions).toContain("どの予定かを識別する名前は残して");
    expect(morningBriefingProfile.instructions).toContain("種類だけに置き換えない");
    expect(morningBriefingProfile.instructions).toContain("startTimeのない予定の時刻は推測しない");
    expect(morningBriefingProfile.instructions).toContain("時系列を示す語で他の予定に結び付けない");
  });

  it("当日の例外がなければ、普段の行動や場所を原稿から落とさない", () => {
    const instructions = morningBriefingProfile.instructions;
    expect(instructions).toContain("既定の解釈がある場合、それは予定の意味を補う事実");
    expect(instructions).toContain("その行動や場所を予定の案内に一度含めて");
    expect(instructions).toContain("タイトルに書かれていないという理由だけで");
    expect(instructions).toContain("当日に別の行動・場所が明記されていれば例外を優先");
  });

  it("人名の予定を中立に扱い、当日の具体的な情報を普段の意味より優先する", () => {
    const instructions = morningBriefingProfile.instructions;
    expect(instructions).toContain("○○さんとの予定があります");
    expect(instructions).toContain("人物と会うだけで、遊びや外出とは決め付けない");
    expect(instructions).toContain("title・description・locationから食事や行き先などが分かる場合だけ");
    expect(instructions).toContain("locationに具体的な場所やオンラインの記述がある場合も");
    expect(instructions).toContain("前後の移動予定だけを根拠に");
  });

  it("予定と時間帯別の雨を短くつなぎ、時刻・移動・目的地の天気を推測しない", () => {
    const instructions = morningBriefingProfile.instructions;
    expect(instructions).toContain("weather.scheduleContext");
    expect(instructions).toContain("同じ予定・時刻・傘の注意を別の箇所や締めで繰り返さない");
    expect(instructions).toContain("他の予定も省略しない");
    expect(instructions).toContain("目的地の天気とは断定しない");
    expect(instructions).toContain("出発・移動・帰宅時刻");
    expect(instructions).toContain("日全体の予報だけで特定の予定と雨の時間帯を結び付けない");
  });

  it("予報の数字や地名・時刻を繰り返さず、雨量に基づいて注意を調整する", () => {
    const instructions = morningBriefingProfile.instructions;
    expect(instructions).toContain("数字は内部の判断用なので読み上げない");
    expect(instructions).toContain("予報の地点名は冒頭の天気で一度だけ");
    expect(instructions).toContain("予定名や行き先に必要な地名は省かない");
    expect(instructions).toContain("予報の開始・終了時刻を数字で重ねて説明しない");
    expect(instructions).toContain("lightは");
    expect(instructions).toContain("normalは");
    expect(instructions).toContain("strongerは");
    expect(instructions).toContain("降水確率の高さから雨の強さを推測しない");
    expect(instructions).toContain("雨が強まる・弱まるという時間変化");
  });

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
