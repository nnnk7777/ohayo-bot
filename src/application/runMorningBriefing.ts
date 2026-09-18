import { settleValues, type ErrorCollector } from "./errorReporting.js";
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
    await track("音声生成・再生", () => dependencies.speaker.speak(briefing));
  }

  return briefing;
}
