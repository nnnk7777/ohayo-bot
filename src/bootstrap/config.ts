import "dotenv/config";
import { resolve } from "node:path";
import type { AudioPlayerPreference } from "../infrastructure/audioPlayer.js";

export type AppConfig = {
  openAiApiKey: string;
  speech: {
    engine: "macos" | "openai";
    audioPlayer: AudioPlayerPreference;
  };
  location: {
    name: string;
    latitude: number;
    longitude: number;
  };
  timeZone: string;
  googleCalendar: GoogleCalendarConfig;
};

export type GoogleCalendarConfig = {
  calendarId: string;
  credentialsPath: string;
  tokenPath: string;
};

export function loadConfig(): AppConfig {
  return {
    openAiApiKey: required("OPENAI_API_KEY"),
    speech: {
      engine: speechEngine(),
      audioPlayer: audioPlayerPreference(),
    },
    location: {
      name: required("WEATHER_LOCATION_NAME"),
      latitude: numberSetting("WEATHER_LATITUDE"),
      longitude: numberSetting("WEATHER_LONGITUDE"),
    },
    timeZone: required("TIME_ZONE"),
    googleCalendar: loadGoogleCalendarConfig(),
  };
}

function speechEngine(): "macos" | "openai" {
  const engine = process.env.SPEECH_ENGINE?.trim() || "macos";
  if (engine === "macos" || engine === "openai") return engine;
  throw new Error("環境変数 SPEECH_ENGINE は macos または openai にしてください。");
}

function audioPlayerPreference(): AudioPlayerPreference {
  const player = process.env.AUDIO_PLAYER?.trim() || "auto";
  if (player === "auto" || player === "afplay" || player === "mpg123") return player;
  throw new Error("環境変数 AUDIO_PLAYER は auto、afplay、mpg123 のいずれかにしてください。");
}

export function loadGoogleCalendarConfig(): GoogleCalendarConfig {
  return {
    calendarId: process.env.GOOGLE_CALENDAR_ID?.trim() || "primary",
    credentialsPath: resolve(required("GOOGLE_CREDENTIALS_PATH")),
    tokenPath: resolve(required("GOOGLE_TOKEN_PATH")),
  };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`環境変数 ${name} を .env に設定してください。`);
  return value;
}

function numberSetting(name: string): number {
  const value = Number(required(name));
  if (!Number.isFinite(value)) throw new Error(`環境変数 ${name} は数値にしてください。`);
  return value;
}
