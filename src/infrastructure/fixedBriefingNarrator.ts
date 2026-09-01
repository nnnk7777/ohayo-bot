import type { BriefingNarrator } from "../application/ports.js";
import type { MorningBriefingPlan } from "../domain/morningBriefing.js";

const FIXED_BRIEFING = `9月1日、火曜日。今日は晴れ。現在25度、最高30度、最低22度の予報です。

午前9時から、ヤマトの段ボールが届く予定です。夜7時10分からは整体です。料金についてのメモがありますが、詳細は確認が必要です。`;

export class FixedBriefingNarrator implements BriefingNarrator {
  async narrate(_plan: MorningBriefingPlan): Promise<string> {
    return FIXED_BRIEFING;
  }
}
