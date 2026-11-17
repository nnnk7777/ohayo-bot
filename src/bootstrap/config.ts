import "dotenv/config";
import { resolve } from "node:path";
import type { AudioPlayerPreference } from "../infrastructure/audioPlayer.js";

export type AppConfig = {
  openAiApiKey: string;
  jmaWeatherArea?: { officeCode: string; areaCode: string };
  pollenApiKey?: string;
  pollenSeasonRegion?: "tokyo";
  yellowDustAreaCode?: string;
  speech: {
    engine: "macos" | "openai";
    audioPlayer: AudioPlayerPreference;
    playAt?: string;
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
    jmaWeatherArea: jmaWeatherArea(),
    pollenApiKey: process.env.GOOGLE_POLLEN_API_KEY?.trim() || undefined,
    pollenSeasonRegion: pollenSeasonRegion(),
    yellowDustAreaCode: yellowDustAreaCode(),
    speech: {
      engine: speechEngine(),
      audioPlayer: audioPlayerPreference(),
      playAt: speechPlayAt(),
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

function jmaWeatherArea(): AppConfig["jmaWeatherArea"] {
  const value = process.env.JMA_WEATHER_FORECAST_AREA?.trim();
  if (!value) return undefined;
  const codes = /^(\d{6}):(\d{6})$/.exec(value);
  if (!codes) throw new Error("環境変数 JMA_WEATHER_FORECAST_AREA は府県予報区:一次細分区域の形式にしてください。");
  return { officeCode: codes[1], areaCode: codes[2] };
}

function yellowDustAreaCode(): string | undefined {
  const value = process.env.JMA_FORECAST_AREA_CODE?.trim();
  if (!value) return undefined;
  if (!/^\d{6}$/.test(value)) throw new Error("環境変数 JMA_FORECAST_AREA_CODE は6桁の数字にしてください。");
  return value;
}

function pollenSeasonRegion(): "tokyo" | undefined {
  const value = process.env.POLLEN_SEASON_REGION?.trim();
  if (!value) return undefined;
  if (value === "tokyo") return value;
  throw new Error("環境変数 POLLEN_SEASON_REGION は tokyo または未設定にしてください。");
}

function speechEngine(): "macos" | "openai" {
  const engine = process.env.SPEECH_ENGINE?.trim() || "macos";
  if (engine === "macos" || engine === "openai") return engine;
  throw new Error("環境変数 SPEECH_ENGINE は macos または openai にしてください。");
}

function audioPlayerPreference(): AudioPlayerPreference {
  const player = process.env.AUDIO_PLAYER?.trim() || "auto";
  if (player === "auto" || player === "afplay" || player === "mpg123" || player === "termux-media-player") return player;
  throw new Error("環境変数 AUDIO_PLAYER は auto、afplay、mpg123、termux-media-player のいずれかにしてください。");
}

function speechPlayAt(): string | undefined {
  const value = process.env.SPEECH_PLAY_AT?.trim();
  if (!value) return undefined;
  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  throw new Error("環境変数 SPEECH_PLAY_AT は HH:mm 形式で指定してください。");
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
