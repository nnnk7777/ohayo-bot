import type { AppConfig } from "./config.js";
import { openAiTtsProfile } from "./speechProfile.js";
import { GoogleCalendarScheduleProvider } from "../infrastructure/googleCalendar.js";
import { OpenMeteoWeatherProvider } from "../infrastructure/openMeteo.js";
import { FixedBriefingNarrator } from "../infrastructure/fixedBriefingNarrator.js";
import { MacSaySpeaker, OpenAiTtsSpeaker } from "../infrastructure/speech.js";

export function createDependencies(config: AppConfig) {
  return {
    scheduleProvider: new GoogleCalendarScheduleProvider(config.googleCalendar),
    weatherProvider: new OpenMeteoWeatherProvider(config.location),
    narrator: new FixedBriefingNarrator(),
    speaker:
      config.speech.engine === "openai"
        ? new OpenAiTtsSpeaker(
            config.openAiApiKey,
            openAiTtsProfile.model,
            openAiTtsProfile.voice,
            openAiTtsProfile.instructions,
            openAiTtsProfile.speed,
          )
        : new MacSaySpeaker(),
  };
}
