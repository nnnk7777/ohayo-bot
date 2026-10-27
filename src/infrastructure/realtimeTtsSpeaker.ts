import { rm, writeFile } from "node:fs/promises";
import type { AudioPlayer } from "./audioPlayer.js";
import { convertAudioToMp3 } from "./audioProcessing.js";
import { OpenAiRealtimeSpeech, type RealtimeSpeechProfile } from "./realtimeSpeech.js";
import { OpenAiTtsSpeaker, type OpenAiTtsSpeakerOptions } from "./speech.js";

export function createRealtimeTtsSpeaker(
  apiKey: string,
  profile: RealtimeSpeechProfile,
  player: AudioPlayer,
  options: Omit<OpenAiTtsSpeakerOptions, "generateAudio"> = {},
): OpenAiTtsSpeaker {
  const generator = new OpenAiRealtimeSpeech(apiKey, profile);
  return new OpenAiTtsSpeaker(apiKey, profile.model, profile.voice, profile.instructions, profile.speed, player, {
    ...options,
    generateAudio: async (text, outputPath, timeoutMs) => {
      const result = await generator.generate(text, timeoutMs);
      const wavPath = `${outputPath}.wav`;
      try {
        await writeFile(wavPath, result.wav, { mode: 0o600 });
        await convertAudioToMp3(wavPath, outputPath);
        return { transcript: result.transcript };
      } finally {
        await rm(wavPath, { force: true });
      }
    },
  });
}
