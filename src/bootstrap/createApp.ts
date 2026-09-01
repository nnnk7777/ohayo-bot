import type { AppConfig } from "./config.js";
import { GoogleCalendarScheduleProvider } from "../infrastructure/googleCalendar.js";
import { OpenMeteoWeatherProvider } from "../infrastructure/openMeteo.js";
import { OpenAiBriefingNarrator } from "../infrastructure/openAiNarrator.js";
import { MacSaySpeaker } from "../infrastructure/speech.js";

export function createDependencies(config: AppConfig) {
  return {
    scheduleProvider: new GoogleCalendarScheduleProvider(config.googleCalendar),
    weatherProvider: new OpenMeteoWeatherProvider(config.location),
    narrator: new OpenAiBriefingNarrator(config.openAiApiKey, config.openAiModel),
    speaker: new MacSaySpeaker(),
  };
}
