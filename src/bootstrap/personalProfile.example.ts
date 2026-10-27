import type { DailyRoutine } from "../domain/personalProfile/dailyRoutine.js";
import type { ScheduleRules } from "../domain/personalProfile/scheduleRules.js";
import type { NewsPreferences } from "../domain/morningNews.js";

// 個人的な設定の雛形。コピーした personalProfile.ts はGit管理しない。
export const personalProfile: { dailyRoutine: DailyRoutine; scheduleRules: ScheduleRules; news?: NewsPreferences; speechReadings?: Record<string, string> } = {
  // 音声用の固有名詞の読み。実際の駅名・路線名などは personalProfile.ts にだけ記入します。
  speechReadings: {},
  // 興味のある地域。実際の地域名はGit管理しない personalProfile.ts にだけ記入します。
  news: {
    localAreas: [],
    // 好きな作品・アーティスト、知りたい情報の種類を指定すると選定に使います。
    // 未指定時は newsProfile.ts の分野・重みを使います。
    // interests: [{ topic: "好きな作品に関連する新作・特集上映", weight: 3 }],
    // excludedTopics: ["興味のない情報の種類"],
  },
  dailyRoutine: {
    // 1=月曜, 2=火曜, ... 7=日曜
    officeWeekdays: [1, 2, 3, 4, 5],
    remoteWeekdays: [],
    // 出社日のみ、各社の公式ページから運行情報を確認します。
    commute: {
      segments: [
        // {
        //   from: "出発駅",
        //   to: "乗換駅",
        //   lineName: "対象路線名",
        //   source: { kind: "jr-east", officialUrl: "JR東日本の対象路線公式URL" },
        //   // 東京メトロの場合は kind、officialUrl に加えて公式JSONの lineId も指定します。
        //   // source: { kind: "tokyo-metro", officialUrl: "対象路線公式URL", lineId: "対象路線のID" },
        // },
      ],
    },
  },
  scheduleRules: {
    // 以下のコメント内の例はすべて架空です。使いたい項目だけコメントを外して調整します。
    // 朝の原稿で伝える必要がないタイトル。照合用の表記をそろえた上で完全一致にします。
    excludedTitles: [
      // "家計メモ",
      // "移動メモ",
    ],
    // 金額メモなど、タイトルの一部が一致する予定を原稿から外します。
    excludedTitleFragments: [
      // "引き落とし",
    ],
    // 表記ゆれをならしたタイトルが完全一致したとき、朝の原稿向けの表現に置き換えます。
    exactTitleRules: [
      // {
      //   title: "💈サンプル美容室",
      //   briefingTitle: "美容院の予約",
      //   requiresGoingOut: true,
      // },
    ],
    // 予定タイトルの先頭に付けた絵文字を、原稿生成の強めの補助情報として使えます。
    // タイトル・説明欄と矛盾する場合は、そちらが優先されます。
    prefixRules: [
      {
        prefix: "♨️",
        hint: "銭湯・サウナに行く予定を表す個人用の記法です。",
        suggestsGoingOut: true,
        // 照合用の表記をそろえ、prefixを除いた残りとdetailが完全一致すると追加します。
        detailHints: [
          // {
          //   detail: "サンプル温浴施設",
          //   hint: "サンプル温浴施設は施設名です。施設名を残して伝えてください。",
          // },
        ],
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
    suffixRules: [
      // {
      //   suffix: "🎂",
      //   // titlePrefixは任意です。指定すると、先頭と末尾の両方が一致したときだけ適用します。
      //   titlePrefix: "🧸",
      //   hint: "この記法は架空のペットの誕生日を表します。祝い方や外出予定は推測しないでください。",
      // },
    ],
    // 人名だけの予定を「〜さんとの予定」として案内する場合に指定します。行動や場所は予定の情報から補います。
    personOnlyTitles: [
      // "サンプル太郎",
    ],
  },
};
