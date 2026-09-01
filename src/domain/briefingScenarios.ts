import { planMorningBriefing, type MorningBriefingPlan } from "./morningBriefing.js";

export const briefingScenarioNames = ["rain", "busy", "quiet", "hot", "all-day"] as const;

export type BriefingScenarioName = (typeof briefingScenarioNames)[number];

const scenarios: Record<BriefingScenarioName, MorningBriefingPlan> = {
  rain: planMorningBriefing({
    date: "2026-09-02",
    weather: {
      condition: "rain",
      currentCelsius: 19,
      lowCelsius: 17,
      highCelsius: 22,
      rainProbability: 80,
    },
    schedules: [],
  }),
  busy: planMorningBriefing({
    date: "2026-09-03",
    weather: {
      condition: "cloudy",
      currentCelsius: 23,
      lowCelsius: 21,
      highCelsius: 27,
      rainProbability: 20,
    },
    schedules: [
      { title: "朝会", startTime: "09:00", isAllDay: false },
      { title: "企画レビュー", startTime: "10:30", isAllDay: false },
      { title: "資料提出", startTime: "13:00", isAllDay: false },
      { title: "チーム定例", startTime: "15:00", isAllDay: false },
      { title: "歯科", startTime: "18:30", isAllDay: false },
      { title: "友人と食事", startTime: "20:00", isAllDay: false },
    ],
  }),
  quiet: planMorningBriefing({
    date: "2026-09-04",
    weather: {
      condition: "clear",
      currentCelsius: 24,
      lowCelsius: 20,
      highCelsius: 28,
      rainProbability: 0,
    },
    schedules: [],
  }),
  hot: planMorningBriefing({
    date: "2026-09-05",
    weather: {
      condition: "clear",
      currentCelsius: 28,
      lowCelsius: 25,
      highCelsius: 35,
      rainProbability: 0,
    },
    schedules: [{ title: "買い物", startTime: "11:00", isAllDay: false }],
  }),
  "all-day": planMorningBriefing({
    date: "2026-09-06",
    weather: {
      condition: "cloudy",
      currentCelsius: 22,
      lowCelsius: 20,
      highCelsius: 26,
      rainProbability: 10,
    },
    schedules: [
      {
        title: "家族の記念日",
        description: "帰宅時に小さな花を買う。",
        isAllDay: true,
      },
      { title: "夕食の予約", startTime: "19:00", isAllDay: false },
    ],
  }),
};

export function getBriefingScenario(name: BriefingScenarioName): MorningBriefingPlan {
  return scenarios[name];
}
