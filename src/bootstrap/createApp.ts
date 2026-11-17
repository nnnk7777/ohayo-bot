import type { ErrorCollector } from "../application/errorReporting.js";
import type { AppConfig } from "./config.js";
import { morningBriefingProfile } from "./briefingProfile.js";
import { personalProfile } from "./personalProfile.js";
import { liveSpeechProfile } from "./liveSpeechProfile.js";
import { GoogleCalendarScheduleProvider, GoogleJapaneseHolidayProvider } from "../infrastructure/googleCalendar.js";
import { OpenMeteoWeatherProvider } from "../infrastructure/openMeteo.js";
import { JmaWeatherProvider } from "../infrastructure/jmaWeather.js";
import { GooglePollenProvider } from "../infrastructure/googlePollen.js";
import { TokyoPollenSeasonProvider } from "../infrastructure/tokyoPollenSeason.js";
import { FilePollenSeasonHistory } from "../infrastructure/pollenSeasonHistory.js";
import { JmaYellowDustProvider } from "../infrastructure/jmaYellowDust.js";
import { OpenAiBriefingNarrator } from "../infrastructure/openAiNarrator.js";
import { createAudioPlayer } from "../infrastructure/audioPlayer.js";
import { MacSaySpeaker } from "../infrastructure/speech.js";
import { createLiveTtsSpeaker } from "../infrastructure/liveTtsSpeaker.js";
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
    regionalWeatherProvider: config.jmaWeatherArea
      ? new JmaWeatherProvider(config.jmaWeatherArea.officeCode, config.jmaWeatherArea.areaCode)
      : undefined,
    pollenProvider: config.pollenApiKey ? new GooglePollenProvider(config.pollenApiKey, config.location) : undefined,
    pollenSeason: config.pollenSeasonRegion === "tokyo" ? {
      provider: new TokyoPollenSeasonProvider(), history: new FilePollenSeasonHistory(),
    } : undefined,
    yellowDustProvider: config.yellowDustAreaCode ? new JmaYellowDustProvider(config.yellowDustAreaCode) : undefined,
    narrator: new OpenAiBriefingNarrator(config.openAiApiKey, morningBriefingProfile),
    speaker:
      config.speech.engine === "openai"
        ? createLiveTtsSpeaker(
            config.openAiApiKey,
            liveSpeechProfile,
            createAudioPlayer(config.speech.audioPlayer),
            { playAt: config.speech.playAt, timeZone: config.timeZone, recordIssue: errors?.record },
          )
        : new MacSaySpeaker(),
  };
}
