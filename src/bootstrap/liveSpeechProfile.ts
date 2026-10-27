import { personalProfile } from "./personalProfile.js";

// 採用したGPT-Liveの音声設定。毎朝の読み上げ処理への接続は別途行う。
export const liveSpeechProfile = {
  model: "gpt-live-1",
  voice: "harema",
  instructions: [
    "すぐ近くの一人に、肩の力を抜いて穏やかに話しかけてください。声を張らず、落ち着いた親しみのある口調にしてください。",
    "日本語の標準的なアクセントで、普段の会話のような自然なテンポで、原稿を省略せず全文読み上げてください。挨拶や日付を歌うように抑揚を付けず、語の途中で不自然に声を上げ下げしないでください。句読点では、意味のまとまりに合った自然な間を取ってください。文末で毎回長く止まらず、話題が変わるところでは少し間を置いてください。",
    ...Object.entries(personalProfile.speechReadings ?? {}).map(
      ([name, reading]) => `「${name}」は「${reading}」と読んでください。`,
    ),
    "挨拶「おはようございます」は、語尾の「ます」、特に「ま」の音を明瞭に発音してください。普段の会話のテンポと穏やかな口調を保ってください。",
  ].join("\n"),
} as const;
