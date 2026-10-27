import type { ErrorCollector } from "../application/errorReporting.js";
import type { AppConfig } from "./config.js";
import { morningBriefingProfile } from "./briefingProfile.js";
import { personalProfile } from "./personalProfile.js";
import { realtimeSpeechProfile } from "./realtimeSpeechProfile.js";
import { GoogleCalendarScheduleProvider, GoogleJapaneseHolidayProvider } from "../infrastructure/googleCalendar.js";
import { OpenMeteoWeatherProvider } from "../infrastructure/openMeteo.js";
import { OpenAiBriefingNarrator } from "../infrastructure/openAiNarrator.js";
import { createAudioPlayer } from "../infrastructure/audioPlayer.js";
import { MacSaySpeaker } from "../infrastructure/speech.js";
import { createRealtimeTtsSpeaker } from "../infrastructure/realtimeTtsSpeaker.js";
import { OfficialTrainStatusProvider } from "../infrastructure/officialTrainStatus.js";
import { morningNewsProfile } from "./newsProfile.js";
import { OpenAiNewsProvider } from "../infrastructure/openAiNews.js";
import { GmailNewsMailer } from "../infrastructure/newsMail.js";
import { FileNewsHistory } from "../infrastructure/newsHistory.js";

export function createDependencies(config: AppConfig, errors?: ErrorCollector) {
  return {
    errors,
    news: process.env.NEWS_ENABLED === "true" ? {
      provider: new OpenAiNewsProvider(config.openAiApiKey, {
        ...morningNewsProfile,
        localAreas: personalProfile.news?.localAreas,
        interests: personalProfile.news?.interests ?? morningNewsProfile.interests,
        excludedTopics: personalProfile.news?.excludedTopics ?? morningNewsProfile.excludedTopics,
      }),
      mailer: new GmailNewsMailer(),
      history: new FileNewsHistory(),
    } : undefined,
    personalProfile,
    scheduleProvider: new GoogleCalendarScheduleProvider(config.googleCalendar),
    holidayProvider: new GoogleJapaneseHolidayProvider(config.googleCalendar),
    trainStatusProvider: new OfficialTrainStatusProvider(personalProfile.dailyRoutine.commute?.segments ?? [], undefined, undefined, errors?.record),
    weatherProvider: new OpenMeteoWeatherProvider(config.location),
    narrator: new OpenAiBriefingNarrator(config.openAiApiKey, morningBriefingProfile),
    speaker:
      config.speech.engine === "openai"
        ? createRealtimeTtsSpeaker(
            config.openAiApiKey,
            realtimeSpeechProfile,
            createAudioPlayer(config.speech.audioPlayer),
            { playAt: config.speech.playAt, timeZone: config.timeZone, recordIssue: errors?.record },
          )
        : new MacSaySpeaker(),
  };
}
