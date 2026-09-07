import { planMorningBriefing, upcomingBriefingDates } from "../domain/morningBriefing.js";
import { isLikelyGoingOut, type DailyRoutine } from "../domain/personalProfile/dailyRoutine.js";
import { applyScheduleRules, type ScheduleRules } from "../domain/personalProfile/scheduleRules.js";
import type {
  BriefingNarrator,
  HolidayProvider,
  ScheduleProvider,
  Speaker,
  Today,
  WeatherProvider,
} from "./ports.js";
import { ensureMorningGreeting } from "./morningGreeting.js";

type Dependencies = {
  personalProfile: { dailyRoutine: DailyRoutine; scheduleRules: ScheduleRules };
  scheduleProvider: ScheduleProvider;
  weatherProvider: WeatherProvider;
  holidayProvider: HolidayProvider;
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
