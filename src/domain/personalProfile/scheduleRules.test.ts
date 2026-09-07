import { describe, expect, it } from "vitest";
import { applyScheduleRules, type ScheduleRules } from "./scheduleRules.js";

const rules: ScheduleRules = {
  excludedTitles: ["💰節制モード", "移動"],
  excludedTitleFragments: ["引き落とし"],
  exactTitleRules: [
    { title: "💈Roberts", briefingTitle: "美容院の予約", requiresGoingOut: true },
  ],
  prefixRules: [
    {
      prefix: "♨️",
      hint: "銭湯・サウナに行く予定を表す個人用の記法です。",
      suggestsGoingOut: true,
      detailHints: [
        { detail: "FLOBA", hint: "FLOBAは施設名です。施設名を残して「FLOBAに行く予定」と伝えてください。" },
        { detail: "地域名の例", hint: "地域名の例は地域名です。「地域名の例の銭湯に行く予定」と伝えてください。" },
      ],
    },
    { prefix: "🍽️", hint: "誰かと食事に行く予定を表す個人用の記法です。", suggestsGoingOut: true },
    { prefix: "🍻", hint: "誰かと飲みに行く予定を表す個人用の記法です。", suggestsGoingOut: true },
    { prefix: "🗿", hint: "オモコロ関連の予定を表す個人用の記法です。" },
    { prefix: "🚚", hint: "荷物の受け取りがある予定を表す個人用の記法です。" },
    { prefix: "🍳", hint: "料理会を表す個人用の記法です。" },
    { prefix: "🎬", hint: "映画を見に行く予定を表す個人用の記法です。", suggestsGoingOut: true },
  ],
  suffixRules: [
    { suffix: "🎂", titlePrefix: "🐶", hint: "予定名は実家の犬（先代犬を含む）の誕生日を表す個人用の記法です。" },
  ],
  personOnlyTitles: ["手塚"],
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
      { title: "💈Roberts", isAllDay: false },
      { title: "♨️FLOBA", isAllDay: false },
      { title: "♨️地域名の例", isAllDay: false },
      { title: "🍽️なかお", isAllDay: false },
      { title: "🍻ともき", isAllDay: false },
      { title: "🗿配信", isAllDay: false },
      { title: "🚚ヤマト段ボール", isAllDay: false },
      { title: "🍳山浦さんたち", isAllDay: false },
      { title: "🎬GOODBOY", isAllDay: false },
      { title: "🐶れお🎂", isAllDay: true },
    ], rules)).toEqual([
      { title: "美容院の予約", isAllDay: false, requiresGoingOut: true },
      {
        title: "♨️FLOBA", isAllDay: false, requiresGoingOut: true,
        briefingHints: [
          "銭湯・サウナに行く予定を表す個人用の記法です。",
          "FLOBAは施設名です。施設名を残して「FLOBAに行く予定」と伝えてください。",
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
        title: "🍽️なかお", isAllDay: false, requiresGoingOut: true,
        briefingHints: ["誰かと食事に行く予定を表す個人用の記法です。"],
      },
      {
        title: "🍻ともき", isAllDay: false, requiresGoingOut: true,
        briefingHints: ["誰かと飲みに行く予定を表す個人用の記法です。"],
      },
      {
        title: "🗿配信", isAllDay: false, requiresGoingOut: undefined,
        briefingHints: ["オモコロ関連の予定を表す個人用の記法です。"],
      },
      {
        title: "🚚ヤマト段ボール", isAllDay: false, requiresGoingOut: undefined,
        briefingHints: ["荷物の受け取りがある予定を表す個人用の記法です。"],
      },
      {
        title: "🍳山浦さんたち", isAllDay: false, requiresGoingOut: undefined,
        briefingHints: ["料理会を表す個人用の記法です。"],
      },
      {
        title: "🎬GOODBOY", isAllDay: false, requiresGoingOut: true,
        briefingHints: ["映画を見に行く予定を表す個人用の記法です。"],
      },
      {
        title: "🐶れお🎂", isAllDay: true,
        briefingHints: ["予定名は実家の犬（先代犬を含む）の誕生日を表す個人用の記法です。"],
      },
    ]);
  });

  it("人名だけの予定は、明示した場合だけ遊びに出かける予定として扱う", () => {
    expect(applyScheduleRules([{ title: "手塚", isAllDay: false }], rules))
      .toEqual([{ title: "手塚さんと一緒に遊びに出かける予定", isAllDay: false }]);
  });
});
