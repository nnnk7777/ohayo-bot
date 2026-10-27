import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createBriefingReviewPlan, reviewBriefingText, type BriefingReviewCase, type BriefingReviewFixture } from "./briefingReview.js";

const fixture = JSON.parse(readFileSync("scripts/fixtures/briefing-review-cases.json", "utf8")) as BriefingReviewFixture;
const scenario: BriefingReviewCase = {
  id: "check", label: "確認", date: "2026-09-02", schedules: [],
  required: ["{{cookingPlace}}"], forbidden: ["架空の誤った場所"], once: ["サンプル企画"], ordered: ["朝の予定", "夜の予定"],
};

describe("briefing review", () => {
  it("単独・混在・表記ゆれとIssue19の22ケースを識別できる形で保持する", () => {
    expect(fixture.cases).toHaveLength(22);
    expect(new Set(fixture.cases.map(value => value.id)).size).toBe(22);
    expect(fixture.cases.every(value => /^[a-z0-9-]+$/.test(value.id))).toBe(true);
    expect(fixture.cases.find(value => value.id === "mixed-usual")?.schedules).toHaveLength(4);
    expect(fixture.cases.find(value => value.id === "mixed-all-day-and-untimed")?.schedules).toHaveLength(5);
    for (const value of fixture.cases) {
      expect(value.facts?.length).toBeGreaterThan(0);
      for (const pattern of [...value.required, ...value.forbidden, ...value.facts!.flatMap(fact => [fact.event, ...(fact.place ? [fact.place] : [])])]) {
        expect(() => new RegExp(pattern.replaceAll("{{cookingPlace}}", "サンプル街"), "gu")).not.toThrow();
      }
    }
  });

  it("全ケースで予定を保持し、表記ゆれのケースには確定言い換えを適用する", () => {
    for (const value of fixture.cases) {
      expect(createBriefingReviewPlan(value, fixture.profile.rules).agenda?.items).toHaveLength(value.schedules.length);
    }
    const normalized = fixture.cases.find(value => value.id === "normalized-gym")!;
    expect(createBriefingReviewPlan(normalized, fixture.profile.rules).agenda?.items[0].title).toBe("ジムの予定");
  });

  it("開催地の記号を正規表現として解釈せず、必要語・禁止語・件数・順序を確認する", () => {
    const checks = reviewBriefingText(scenario, "朝の予定、サンプル企画、場所(駅)、夜の予定", "場所(駅)");
    expect(checks.every(check => check.passed)).toBe(true);
    expect(reviewBriefingText(scenario, "朝の予定、サンプル企画、場所駅、夜の予定", "場所(駅)").some(check => !check.passed)).toBe(true);
  });

  it("空原稿、欠落、重複、禁止語、逆順を要確認にする", () => {
    expect(reviewBriefingText(scenario, "", "会場").some(check => !check.passed)).toBe(true);
    const checks = reviewBriefingText(scenario, "夜の予定、会場、サンプル企画、サンプル企画、架空の誤った場所、朝の予定", "会場");
    expect(checks.filter(check => !check.passed).map(check => check.kind)).toEqual(["forbidden", "once", "order"]);
  });

  const mixed = fixture.cases.find(value => value.id === "mixed-usual")!;
  const correct = "10時にサンプル太郎さんとの予定があります。12時にサンプル企画の配信を見ます。15時にサンプル街Dで料理会です。18時に自宅で荷物を受け取ります。";

  it("必要語がすべてあっても、時刻の変更や予定間での入れ替えを検出する", () => {
    expect(reviewBriefingText(mixed, correct, "サンプル街D").every(check => check.passed)).toBe(true);
    const wrong = correct.replace("10時", "12時").replace("12時にサンプル企画", "10時にサンプル企画");
    const checks = reviewBriefingText(mixed, wrong, "サンプル街D");
    expect(checks.filter(check => !check.passed).map(check => check.kind)).toEqual(["event-time", "event-time"]);
    const added = correct.replace("15時にサンプル街Dで料理会です", "15時の料理会はサンプル街Dで18時からです");
    expect(reviewBriefingText(mixed, added, "サンプル街D").filter(check => !check.passed).map(check => check.kind)).toEqual(["event-time"]);
  });

  it("必要な場所が原稿の別の予定にあっても、正しい予定に結び付かなければ検出する", () => {
    const wrong = correct.replace("10時に", "10時にサンプル街Dで").replace("15時にサンプル街Dで", "15時に自宅で").replace("18時に自宅で", "18時に");
    expect(reviewBriefingText(mixed, wrong, "サンプル街D").filter(check => !check.passed).map(check => check.kind))
      .toEqual(["event-place", "event-place"]);
  });

  it("同じ文の複数予定も時刻・読点で分け、時刻が後ろにある表現も確認する", () => {
    const joined = correct.replaceAll("。", "、");
    expect(reviewBriefingText(mixed, joined, "サンプル街D").every(check => check.passed)).toBe(true);
    const eventFirst = correct.replace("15時にサンプル街Dで料理会です", "料理会はサンプル街Dで午後3時からです");
    expect(reviewBriefingText(mixed, eventFirst, "サンプル街D").every(check => check.passed)).toBe(true);
    const swapped = joined.replace("15時にサンプル街Dで", "18時に自宅で").replace("18時に自宅で荷物", "15時にサンプル街Dで荷物");
    expect(reviewBriefingText(mixed, swapped, "サンプル街D").filter(check => !check.passed)).toHaveLength(4);
  });

  it("全角時刻・分・半・午前午後を確認し、不明な表記は通過と断定しない", () => {
    const value = { ...scenario, required: [], once: [], ordered: [], facts: [{ event: "料理会", startTime: "15:30", place: "{{cookingPlace}}" }] };
    for (const text of ["１５：３０に会場(駅)で料理会です。", "午後3時半に会場(駅)で料理会です。", "料理会は会場(駅)で15時30分からです。"]) {
      expect(reviewBriefingText(value, text, "会場(駅)").every(check => check.passed)).toBe(true);
    }
    expect(reviewBriefingText(value, "会場(駅)で午前三時半から料理会です。", "").some(check => !check.passed)).toBe(true);
  });

  it("終日・時刻未定の予定への時刻追加、欠落、曖昧な関連付けを要確認にする", () => {
    const value = { ...scenario, required: [], once: [], ordered: [], facts: [
      { event: "荷物", startTime: null }, { event: "記念日", startTime: null },
    ] };
    expect(reviewBriefingText(value, "自宅で荷物を受け取ります。今日は記念日です。", "").every(check => check.passed)).toBe(true);
    for (const text of ["18時に荷物を受け取ります。今日は記念日です。", "午後三時に荷物を受け取ります。今日は記念日です。", "正午に荷物を受け取ります。今日は記念日です。", "今日は記念日です。", "荷物と記念日の予定です。"]) {
      expect(reviewBriefingText(value, text, "").some(check => !check.passed)).toBe(true);
    }
  });
});
