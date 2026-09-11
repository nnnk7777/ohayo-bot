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
  const [weather, rawSchedules, isHoliday] = await Promise.all([
    dependencies.weatherProvider.getWeather(options.today),
    dependencies.scheduleProvider.getSchedules(options.today),
    dependencies.holidayProvider.isHoliday(options.today),
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
    ? await dependencies.trainStatusProvider!.getStatuses(options.today)
    : [];
  const upcomingDates = upcomingBriefingDates(options.today.date, isHoliday);
  const upcomingScheduleDays = await Promise.all(
    upcomingDates.map(async (date) => ({
      date,
      schedules: applyScheduleRules(
        await dependencies.scheduleProvider.getSchedules({ ...options.today, date }),
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
  const briefing = ensureMorningGreeting(await dependencies.narrator.narrate(plan));

  if (!briefing) {
    throw new Error("原稿生成に失敗しました。空の原稿が返されました。");
  }

  console.log(`\n${briefing}\n`);

  if (options.speak) {
    await dependencies.speaker.speak(briefing);
  }

  return briefing;
}
