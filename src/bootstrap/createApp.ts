import type { ErrorCollector } from "../application/errorReporting.js";
import type { AppConfig } from "./config.js";
import { morningBriefingProfile } from "./briefingProfile.js";
import { personalProfile } from "./personalProfile.js";
import { openAiTtsProfile } from "./speechProfile.js";
import { GoogleCalendarScheduleProvider, GoogleJapaneseHolidayProvider } from "../infrastructure/googleCalendar.js";
import { OpenMeteoWeatherProvider } from "../infrastructure/openMeteo.js";
import { OpenAiBriefingNarrator } from "../infrastructure/openAiNarrator.js";
import { createAudioPlayer } from "../infrastructure/audioPlayer.js";
import { MacSaySpeaker, OpenAiTtsSpeaker } from "../infrastructure/speech.js";
import { OfficialTrainStatusProvider } from "../infrastructure/officialTrainStatus.js";

export function createDependencies(config: AppConfig, errors?: ErrorCollector) {
  return {
    errors,
    personalProfile,
    scheduleProvider: new GoogleCalendarScheduleProvider(config.googleCalendar),
    holidayProvider: new GoogleJapaneseHolidayProvider(config.googleCalendar),
    trainStatusProvider: new OfficialTrainStatusProvider(personalProfile.dailyRoutine.commute?.segments ?? [], undefined, undefined, errors?.record),
    weatherProvider: new OpenMeteoWeatherProvider(config.location),
    narrator: new OpenAiBriefingNarrator(config.openAiApiKey, morningBriefingProfile),
    speaker:
      config.speech.engine === "openai"
        ? new OpenAiTtsSpeaker(
            config.openAiApiKey,
            openAiTtsProfile.model,
            openAiTtsProfile.voice,
            openAiTtsProfile.instructions,
            openAiTtsProfile.speed,
            createAudioPlayer(config.speech.audioPlayer),
            { playAt: config.speech.playAt, timeZone: config.timeZone, recordIssue: errors?.record },
          )
        : new MacSaySpeaker(),
  };
}
