import { describe, expect, it } from "vitest";
import { applyScheduleRules, type ScheduleRules } from "./scheduleRules.js";

const rules: ScheduleRules = {
  excludedTitles: ["💰節制モード", "移動"],
  excludedTitleFragments: ["引き落とし"],
  exactTitleRules: [
    { title: "💈テスト美容室", briefingTitle: "美容院の予約", requiresGoingOut: true },
  ],
  prefixRules: [
    {
      prefix: "♨️",
      hint: "銭湯・サウナに行く予定を表す個人用の記法です。",
      suggestsGoingOut: true,
      detailHints: [
        { detail: "テスト施設", hint: "テスト施設は施設名です。施設名を残して「テスト施設に行く予定」と伝えてください。" },
        { detail: "地域名の例", hint: "地域名の例は地域名です。「地域名の例の銭湯に行く予定」と伝えてください。" },
      ],
    },
    { prefix: "🍽️", hint: "誰かと食事に行く予定を表す個人用の記法です。", suggestsGoingOut: true },
    { prefix: "🍻", hint: "誰かと飲みに行く予定を表す個人用の記法です。", suggestsGoingOut: true },
    { prefix: "🗿", hint: "テスト企画関連の予定を表す個人用の記法です。" },
    { prefix: "🚚", hint: "荷物の受け取りがある予定を表す個人用の記法です。" },
    { prefix: "🍳", hint: "料理会を表す個人用の記法です。" },
    { prefix: "🎬", hint: "映画を見に行く予定を表す個人用の記法です。", suggestsGoingOut: true },
  ],
  suffixRules: [
    { suffix: "🎂", titlePrefix: "🐶", hint: "予定名はテスト用のペットの誕生日を表す個人用の記法です。" },
  ],
  personOnlyTitles: ["テスト友人"],
};

describe("applyScheduleRules", () => {
  it("除外対象を原稿用の予定から外す", () => {
    expect(applyScheduleRules([
      { title: "💰節制モード", isAllDay: true },
      { title: "移動", isAllDay: false },
      { title: "整骨院:定期引き落とし", isAllDay: true },
      { title: "企画レビュー", isAllDay: false },
    ], rules)).toEqual([{ title: "企画レビュー", isAllDay: false }]);
  });

  it("登録済みの予定名を言い換え、絵文字は補助情報として付ける", () => {
    expect(applyScheduleRules([
      { title: "💈テスト美容室", isAllDay: false },
      { title: "♨️テスト施設", isAllDay: false },
      { title: "♨️地域名の例", isAllDay: false },
      { title: "🍽️テスト友人A", isAllDay: false },
      { title: "🍻テスト友人B", isAllDay: false },
      { title: "🗿配信", isAllDay: false },
      { title: "🚚テスト配送品", isAllDay: false },
      { title: "🍳テストグループ", isAllDay: false },
      { title: "🎬架空映画A", isAllDay: false },
      { title: "🐶テスト犬🎂", isAllDay: true },
    ], rules)).toEqual([
      { title: "美容院の予約", isAllDay: false, requiresGoingOut: true },
      {
        title: "♨️テスト施設", isAllDay: false, requiresGoingOut: true,
        briefingHints: [
          "銭湯・サウナに行く予定を表す個人用の記法です。",
          "テスト施設は施設名です。施設名を残して「テスト施設に行く予定」と伝えてください。",
        ],
      },
      {
        title: "♨️地域名の例", isAllDay: false, requiresGoingOut: true,
        briefingHints: [
          "銭湯・サウナに行く予定を表す個人用の記法です。",
          "地域名の例は地域名です。「地域名の例の銭湯に行く予定」と伝えてください。",
        ],
      },
      {
        title: "🍽️テスト友人A", isAllDay: false, requiresGoingOut: true,
        briefingHints: ["誰かと食事に行く予定を表す個人用の記法です。"],
      },
      {
        title: "🍻テスト友人B", isAllDay: false, requiresGoingOut: true,
        briefingHints: ["誰かと飲みに行く予定を表す個人用の記法です。"],
      },
      {
        title: "🗿配信", isAllDay: false, requiresGoingOut: undefined,
        briefingHints: ["テスト企画関連の予定を表す個人用の記法です。"],
      },
      {
        title: "🚚テスト配送品", isAllDay: false, requiresGoingOut: undefined,
        briefingHints: ["荷物の受け取りがある予定を表す個人用の記法です。"],
      },
      {
        title: "🍳テストグループ", isAllDay: false, requiresGoingOut: undefined,
        briefingHints: ["料理会を表す個人用の記法です。"],
      },
      {
        title: "🎬架空映画A", isAllDay: false, requiresGoingOut: true,
        briefingHints: ["映画を見に行く予定を表す個人用の記法です。"],
      },
      {
        title: "🐶テスト犬🎂", isAllDay: true,
        briefingHints: ["予定名はテスト用のペットの誕生日を表す個人用の記法です。"],
      },
    ]);
  });

  it("人名だけの予定は、明示した場合だけ遊びに出かける予定として扱う", () => {
    expect(applyScheduleRules([{ title: "テスト友人", isAllDay: false }], rules))
      .toEqual([{ title: "テスト友人さんと一緒に遊びに出かける予定", isAllDay: false }]);
  });
});
