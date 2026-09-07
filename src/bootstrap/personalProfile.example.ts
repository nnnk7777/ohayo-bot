import type { DailyRoutine } from "../domain/personalProfile/dailyRoutine.js";
import type { ScheduleRules } from "../domain/personalProfile/scheduleRules.js";

// 個人的な設定の雛形。コピーした personalProfile.ts はGit管理しない。
export const personalProfile: { dailyRoutine: DailyRoutine; scheduleRules: ScheduleRules } = {
  dailyRoutine: {
    // 1=月曜, 2=火曜, ... 7=日曜
    officeWeekdays: [1, 3, 4],
    remoteWeekdays: [2, 5],
  },
  scheduleRules: {
    // 朝の原稿で伝える必要がないタイトル。完全一致で指定します。
    excludedTitles: [],
    // 金額メモなど、タイトルの一部が一致する予定を原稿から外します。
    excludedTitleFragments: [],
    // 略称などを朝の原稿向けの表現に置き換えます。
    exactTitleRules: [],
    // 予定タイトルの先頭に付けた絵文字を、原稿生成の強めの補助情報として使えます。
    // タイトル・説明欄と矛盾する場合は、そちらが優先されます。
    prefixRules: [
      {
        prefix: "♨️",
        hint: "銭湯・サウナに行く予定を表す個人用の記法です。",
        suggestsGoingOut: true,
        // 予定名の中身が施設名・地域名などと分かる場合に、個別の伝え方を追加できます。
        detailHints: [],
      },
      { prefix: "🍚", hint: "誰かと食事に行く予定を表す個人用の記法です。", suggestsGoingOut: true },
      { prefix: "🍽️", hint: "誰かと食事に行く予定を表す個人用の記法です。", suggestsGoingOut: true },
      { prefix: "🍺", hint: "誰かと飲みに行く予定を表す個人用の記法です。", suggestsGoingOut: true },
      { prefix: "🍻", hint: "誰かと飲みに行く予定を表す個人用の記法です。", suggestsGoingOut: true },
      { prefix: "🚚", hint: "荷物の受け取りがある予定を表す個人用の記法です。" },
      { prefix: "🍳", hint: "料理会を表す個人用の記法です。" },
      { prefix: "🎬", hint: "映画を見に行く予定を表す個人用の記法です。", suggestsGoingOut: true },
      { prefix: "🎮", hint: "友人などとゲームをする予定を表す個人用の記法です。" },
      { prefix: "🎻", hint: "ライブに行く予定を表す個人用の記法です。", suggestsGoingOut: true },
      { prefix: "🎸", hint: "ライブに行く予定を表す個人用の記法です。", suggestsGoingOut: true },
    ],
    // タイトル末尾の記号に意味がある場合に、補助情報を付けられます。
    suffixRules: [],
    // 人名だけの予定を「〜さんと一緒に遊びに出かける予定」として読ませたい場合に指定します。
    personOnlyTitles: [],
  },
};
