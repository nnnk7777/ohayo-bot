import { planMorningBriefing } from "../domain/morningBriefing.js";
import type {
  BriefingNarrator,
  ScheduleProvider,
  Speaker,
  Today,
  WeatherProvider,
} from "./ports.js";

type Dependencies = {
  scheduleProvider: ScheduleProvider;
  weatherProvider: WeatherProvider;
  narrator: BriefingNarrator;
  speaker: Speaker;
};

export async function runMorningBriefing(
  dependencies: Dependencies,
  options: { today: Today; speak: boolean },
): Promise<string> {
  const [weather, schedules] = await Promise.all([
    dependencies.weatherProvider.getWeather(options.today),
    dependencies.scheduleProvider.getSchedules(options.today),
  ]);

  const plan = planMorningBriefing({
    date: options.today.date,
    weather,
    schedules,
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
