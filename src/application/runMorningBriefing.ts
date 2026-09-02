import { planMorningBriefing, upcomingBriefingDates } from "../domain/morningBriefing.js";
import { isLikelyGoingOut } from "../domain/personalProfile/dailyRoutine.js";
import type {
  BriefingNarrator,
  HolidayProvider,
  ScheduleProvider,
  Speaker,
  Today,
  WeatherProvider,
} from "./ports.js";

type Dependencies = {
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
  const [weather, schedules, isHoliday] = await Promise.all([
    dependencies.weatherProvider.getWeather(options.today),
    dependencies.scheduleProvider.getSchedules(options.today),
    dependencies.holidayProvider.isHoliday(options.today),
  ]);
  const upcomingDates = upcomingBriefingDates(options.today.date, isHoliday);
  const upcomingScheduleDays = await Promise.all(
    upcomingDates.map(async (date) => ({
      date,
      schedules: await dependencies.scheduleProvider.getSchedules({ ...options.today, date }),
    })),
  );

  const plan = planMorningBriefing({
    date: options.today.date,
    locationName: options.locationName,
    weather,
    schedules,
    isHoliday,
    upcomingScheduleDays,
    isLikelyGoingOut: isLikelyGoingOut({ date: options.today.date, isHoliday, schedules }),
  });
  const briefing = (await dependencies.narrator.narrate(plan)).trim();

  if (!briefing) {
    throw new Error("原稿生成に失敗しました。空の原稿が返されました。");
  }

  console.log(`\n${briefing}\n`);

  if (options.speak) {
    await dependencies.speaker.speak(briefing);
  }

  return briefing;
}
