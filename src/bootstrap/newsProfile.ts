export const morningNewsProfile = {
  model: "gpt-5.6-luna",
  // 数値が大きい分野を優先。音声・モデルの設定と同様、秘密情報ではありません。
  interests: [
    { topic: "好みにつながる音楽の新作・来日・ライブ", weight: 3 },
    { topic: "表現や雰囲気に特徴がある映画・ミニシアター・特集上映", weight: 3 },
    { topic: "物語や世界観を楽しめるゲーム", weight: 3 },
    { topic: "文学・言語・ものの見方に関連する新刊・対談・催し", weight: 2 },
    { topic: "料理・道具・手を動かす体験", weight: 2 },
    { topic: "個人開発・生活の自動化・写真に使える技術", weight: 1 },
  ],
  excludedTopics: ["好みとの接点がない芸能ゴシップ・ランキング・売上だけの話題", "一般的な健康・自己啓発の煽り記事"],
} as const;
