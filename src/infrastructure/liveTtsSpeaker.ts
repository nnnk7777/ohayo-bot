import { rm, writeFile } from "node:fs/promises";
import type { AudioPlayer } from "./audioPlayer.js";
import { convertAudioToMp3 } from "./audioProcessing.js";
import { OpenAiLiveSpeech, type LiveSpeechProfile } from "./liveSpeech.js";
import { OpenAiTtsSpeaker, type OpenAiTtsSpeakerOptions } from "./speech.js";

export function createLiveTtsSpeaker(
  apiKey: string, profile: LiveSpeechProfile, player: AudioPlayer,
  options: Omit<OpenAiTtsSpeakerOptions, "generateAudio"> = {},
): OpenAiTtsSpeaker {
  const generator = new OpenAiLiveSpeech(apiKey, profile);
  return new OpenAiTtsSpeaker(apiKey, profile.model, profile.voice, profile.instructions, 1, player, {
    generationTimeoutMs: 90_000,
    ...options,
    generateAudio: async (text, outputPath, timeoutMs) => {
      const result = await generator.generate(text, timeoutMs);
      const wavPath = `${outputPath}.wav`;
      try {
        await writeFile(wavPath, result.wav, { mode: 0o600 });
        await convertAudioToMp3(wavPath, outputPath);
        return { transcript: result.transcript, sessionSeconds: result.sessionSeconds };
      } finally { await rm(wavPath, { force: true }); }
    },
  });
}
