import "dotenv/config";
import { resolve } from "node:path";

export type AppConfig = {
  openAiApiKey: string;
  openAiModel: string;
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
    openAiModel: process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna",
    location: {
      name: required("WEATHER_LOCATION_NAME"),
      latitude: numberSetting("WEATHER_LATITUDE"),
      longitude: numberSetting("WEATHER_LONGITUDE"),
    },
    timeZone: required("TIME_ZONE"),
    googleCalendar: loadGoogleCalendarConfig(),
  };
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
