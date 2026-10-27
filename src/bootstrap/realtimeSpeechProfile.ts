import { openAiTtsProfile } from "./speechProfile.js";

// 通常の朝の読み上げと固定原稿の試聴で共通のRealtimeモデルを使う。
export const realtimeSpeechProfile = {
  ...openAiTtsProfile,
  model: "gpt-realtime-2.1-mini",
} as const;
