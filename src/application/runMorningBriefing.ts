import { settleValues, type ErrorCollector } from "./errorReporting.js";
import { safeErrorCode } from "../domain/errorReport.js";
import { canIncludeMorningNews, type NewsItem } from "../domain/morningNews.js";
import { planMorningBriefing, upcomingBriefingDates } from "../domain/morningBriefing.js";
import { isLikelyGoingOut, isOfficeDay, type DailyRoutine } from "../domain/personalProfile/dailyRoutine.js";
import { applyScheduleRules, type ScheduleRules } from "../domain/personalProfile/scheduleRules.js";
import { commuteIssues } from "../domain/trainOperation.js";
import type {
  BriefingNarrator,
  HolidayProvider,
  ScheduleProvider,
  Speaker,
  Today,
  WeatherProvider,
  TrainStatusProvider,
  NewsProvider,
  NewsMailer,
  NewsHistory,
} from "./ports.js";
import { ensureMorningGreeting } from "./morningGreeting.js";

type Dependencies = {
  errors?: ErrorCollector;
  personalProfile: { dailyRoutine: DailyRoutine; scheduleRules: ScheduleRules };
  scheduleProvider: ScheduleProvider;
  weatherProvider: WeatherProvider;
  holidayProvider: HolidayProvider;
  trainStatusProvider?: TrainStatusProvider;
  narrator: BriefingNarrator;
  speaker: Speaker;
  news?: { provider: NewsProvider; mailer: NewsMailer; history?: NewsHistory };
};

export async function runMorningBriefing(
  dependencies: Dependencies,
  options: { today: Today; speak: boolean; locationName?: string },
): Promise<string> {
  const track = <T>(stage: string, work: () => Promise<T>): Promise<T> => dependencies.errors ? dependencies.errors.track(stage, work) : work();
  const [weather, rawSchedules, isHoliday] = await settleValues([
    track("天気取得", () => dependencies.weatherProvider.getWeather(options.today)),
    track("当日予定取得", () => dependencies.scheduleProvider.getSchedules(options.today)),
    track("祝日取得", () => dependencies.holidayProvider.isHoliday(options.today)),
  ]);
  const schedules = applyScheduleRules(rawSchedules, dependencies.personalProfile.scheduleRules);
  const shouldCheckTrainStatus = Boolean(
    dependencies.trainStatusProvider &&
    dependencies.personalProfile.dailyRoutine.commute?.segments.length &&
    isOfficeDay({
      date: options.today.date,
      isHoliday,
      schedules,
      dailyRoutine: dependencies.personalProfile.dailyRoutine,
    }),
  );
  const trainStatuses = shouldCheckTrainStatus
    ? await track("電車情報取得", () => dependencies.trainStatusProvider!.getStatuses(options.today))
    : [];
  const upcomingDates = upcomingBriefingDates(options.today.date, isHoliday);
  const upcomingScheduleDays = await settleValues(
    upcomingDates.map(async (date) => ({
      date,
      schedules: applyScheduleRules(
        await track("先の予定取得", () => dependencies.scheduleProvider.getSchedules({ ...options.today, date })),
        dependencies.personalProfile.scheduleRules,
      ),
    })),
  );

  const plan = planMorningBriefing({
    date: options.today.date,
    locationName: options.locationName,
    weather,
    schedules,
    isHoliday,
    upcomingScheduleDays,
    commuteIssues: commuteIssues(trainStatuses),
    isLikelyGoingOut: isLikelyGoingOut({
      date: options.today.date,
      isHoliday,
      schedules,
      dailyRoutine: dependencies.personalProfile.dailyRoutine,
    }),
  });
  let news: NewsItem | undefined;
  if (dependencies.news && canIncludeMorningNews(plan)) {
    try {
      news = dependencies.news.history
        ? await dependencies.news.provider.getNews(options.today, await dependencies.news.history.read())
        : await dependencies.news.provider.getNews(options.today);
      if (news) {
        plan.news = { announcement: news.announcement };
        plan.targetDurationSeconds += 10;
      }
    } catch (error) {
      dependencies.errors?.record("ニュース取得", safeErrorCode(error));
      console.warn("ニュースを取得できなかったため、今日のニュース案内を省きます。");
    }
  }
  const briefing = await track("原稿生成", async () => {
    const value = ensureMorningGreeting(await dependencies.narrator.narrate(plan));
    if (!value) {
      dependencies.errors?.fatal("原稿生成", undefined, "EMPTY_SCRIPT");
      throw new Error("原稿生成に失敗しました。空の原稿が返されました。");
    }
    return value;
  });


  console.log(`\n${briefing}\n`);

  if (options.speak) {
    if (news && dependencies.news) {
      try { await dependencies.news.mailer.sendNews(news); }
      catch (error) {
        dependencies.errors?.record("ニュースメール送信", safeErrorCode(error));
        console.warn("ニュースメールを送信できませんでした。音声案内は続けます。");
      }
    }
    await track("音声生成・再生", () => dependencies.speaker.speak(briefing));
    if (news && dependencies.news?.history) {
      try { await dependencies.news.history.record({ url: news.url, title: news.title }); }
      catch (error) {
        dependencies.errors?.record("ニュース履歴保存", safeErrorCode(error));
        console.warn("ニュースの紹介履歴を保存できませんでした。");
      }
    }
  }

  return briefing;
}
