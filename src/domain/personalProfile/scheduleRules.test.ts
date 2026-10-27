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
  const aliasRules: ScheduleRules = {
    ...rules,
    exactTitleRules: [{ title: "🥊Sample Gym", briefingTitle: "ジムの予定", requiresGoingOut: true }],
  };
  it.each(["🥊ＳＡＭＰＬＥ　ＧＹＭ", "  🥊 sample   gym  ", "🥊Sample Gym"])("表記ゆれを照合時だけ吸収する: %s", title => {
    expect(applyScheduleRules([{ title, description: "備考　ＡＢＣ", isAllDay: false }], aliasRules))
      .toEqual([{ title: "ジムの予定", description: "備考　ＡＢＣ", isAllDay: false, requiresGoingOut: true }]);
  });

  it("設定側の表記もそろえ、単語間の空白がない別名は区別する", () => {
    const config = { ...aliasRules, exactTitleRules: [{ title: "  🥊 ＳＡＭＰＬＥ　ＧＹＭ ", briefingTitle: "ジムの予定" }] };
    expect(applyScheduleRules([{ title: "🥊sample gym", isAllDay: false }], config)[0].title).toBe("ジムの予定");
    expect(applyScheduleRules([{ title: "🥊SampleGym", isAllDay: false }], config)[0].title).toBe("🥊SampleGym");
  });

  it("絵文字の表示形式や直後の空白が違っても補助情報を付け、元のタイトルは保持する", () => {
    expect(applyScheduleRules([{ title: "♨ テスト施設", isAllDay: false }], rules)[0]).toMatchObject({
      title: "♨ テスト施設", briefingHints: [rules.prefixRules[0].hint, rules.prefixRules[0].detailHints![0].hint],
    });
    expect(applyScheduleRules([{ title: "🍽 テスト友人A", isAllDay: false }], rules)[0].requiresGoingOut).toBe(true);
  });

  it("人名と除外の照合にも表記ゆれを適用する", () => {
    expect(applyScheduleRules([{ title: " ﾃｽﾄ友人 ", isAllDay: false }], rules)[0].title).toBe("テスト友人さんとの予定");
    expect(applyScheduleRules([{ title: "　移動　", isAllDay: false }], rules)).toEqual([]);
    const config = { ...rules, excludedTitleFragments: ["BUDGET MEMO"] };
    expect(applyScheduleRules([{ title: "定期 budget　memo", isAllDay: true }], config)).toEqual([]);
  });

  it("正規化後も同じ配列の先頭ルールを優先する", () => {
    const config = { ...aliasRules, exactTitleRules: [
      { title: "🥊Sample Gym", briefingTitle: "先頭の予約" },
      { title: "🥊ＳＡＭＰＬＥ　ＧＹＭ", briefingTitle: "後ろの予約" },
    ] };
    expect(applyScheduleRules([{ title: "🥊sample gym", isAllDay: false }], config)[0].title).toBe("先頭の予約");
  });

  it("空白だけの条件を無視し、無関係な予定や原文を書き換えない", () => {
    const config = { ...rules, excludedTitleFragments: ["　"], prefixRules: [{ prefix: " ", hint: "使わない" }] };
    const schedule = { title: "  ＡＢＣ　別の予定 ", description: "本文　そのまま", location: "会場　Ａ", isAllDay: false };
    expect(applyScheduleRules([schedule], config)).toEqual([schedule]);
  });

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

  it("登録した人名だけの予定は、行動や外出を決め付けず案内する", () => {
    expect(applyScheduleRules([{ title: "テスト友人", isAllDay: false }], rules))
      .toEqual([{ title: "テスト友人さんとの予定", isAllDay: false }]);
  });

  it("人名の予定にある行動や場所の事実を原稿生成へ残す", () => {
    const result = applyScheduleRules([{
      title: "テスト友人", startTime: "18:00", isAllDay: false,
      description: "架空の街Aで食事", location: "サンプル会場",
    }], rules);
    expect(result).toEqual([{
      title: "テスト友人さんとの予定", startTime: "18:00", isAllDay: false,
      description: "架空の街Aで食事", location: "サンプル会場",
    }]);
    expect(result[0].requiresGoingOut).toBeUndefined();
  });

  it("登録していない予定名を人物として扱わない", () => {
    expect(applyScheduleRules([{ title: "サンプル作品名", isAllDay: false }], rules))
      .toEqual([{ title: "サンプル作品名", isAllDay: false }]);
  });
});
