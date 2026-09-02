import { planMorningBriefing, type MorningBriefingPlan, type Schedule } from "./morningBriefing.js";

export const briefingScenarioNames = [
  "rain",
  "rain-going-out",
  "rain-staying-home",
  "busy",
  "quiet",
  "hot",
  "cold",
  "sunny-uv",
  "windy",
  "all-day",
  "monday",
  "friday",
] as const;

export type BriefingScenarioName = (typeof briefingScenarioNames)[number];

export const briefingScenarioLabels: Record<BriefingScenarioName, string> = {
  rain: "雨（予定なし）",
  "rain-going-out": "雨＋外出予定あり",
  "rain-staying-home": "雨＋在宅想定",
  busy: "予定多数",
  quiet: "予定なし・穏やかな日",
  hot: "暑さ＋日差し",
  cold: "冷え込み",
  "sunny-uv": "日差しが強い日",
  windy: "強風",
  "all-day": "終日予定あり",
  monday: "月曜・今週最初の予定",
  friday: "金曜・週末から週明けの予定",
};

export function composeBriefingScenario(names: BriefingScenarioName[]): MorningBriefingPlan {
  const selected = new Set(names);
  const isCold = selected.has("cold");
  const isHot = selected.has("hot");
  const isRainy = selected.has("rain") || selected.has("rain-going-out") || selected.has("rain-staying-home");
  const isWindy = selected.has("windy");
  const isMonday = selected.has("monday");
  const isFriday = selected.has("friday");
  const date = isMonday ? "2026-09-07" : isFriday ? "2026-09-11" : "2026-09-02";

  return planMorningBriefing({
    date,
    locationName: "武蔵野市",
    weather: {
      condition: isRainy ? "rain" : isWindy ? "cloudy" : "clear",
      currentCelsius: isCold ? 5 : isHot ? 28 : 20,
      lowCelsius: isCold ? 1 : isHot ? 25 : 15,
      highCelsius: isCold ? 10 : isHot ? 35 : 25,
      rainProbability: isRainy ? 80 : 10,
      apparentLowCelsius: isCold ? 2 : undefined,
      apparentHighCelsius: isHot ? 37 : undefined,
      maxUvIndex: isHot ? 8 : selected.has("sunny-uv") ? 7 : undefined,
      maxWindSpeedKmh: isWindy ? 34 : undefined,
    },
    schedules: combinedSchedules(selected),
    isLikelyGoingOut: selected.has("rain-staying-home")
      ? false
      : selected.has("rain-going-out")
        ? true
        : undefined,
    upcomingScheduleDays: isMonday
      ? [{ date: "2026-09-09", schedules: [{ title: "企画レビュー", startTime: "10:00", isAllDay: false }] }]
      : isFriday
        ? [{ date: "2026-09-14", schedules: [{ title: "歯科", startTime: "09:30", isAllDay: false }] }]
        : undefined,
  });
}

function combinedSchedules(selected: Set<BriefingScenarioName>): Schedule[] {
  if (selected.has("busy")) {
    return [
      { title: "朝会", startTime: "09:00", isAllDay: false },
      { title: "企画レビュー", startTime: "10:30", isAllDay: false },
      { title: "資料提出", startTime: "13:00", isAllDay: false },
      { title: "チーム定例", startTime: "15:00", isAllDay: false },
      { title: "歯科", startTime: "18:30", isAllDay: false },
    ];
  }
  if (selected.has("all-day")) {
    return [
      { title: "家族の記念日", description: "帰宅時に小さな花を買う。", isAllDay: true },
      { title: "夕食の予約", startTime: "19:00", isAllDay: false },
    ];
  }
  if (selected.has("rain-going-out")) {
    return [{ title: "外出予定", startTime: "10:00", isAllDay: false }];
  }
  return [];
}

const scenarios: Record<BriefingScenarioName, MorningBriefingPlan> = {
  rain: planMorningBriefing({
    date: "2026-09-02",
    locationName: "武蔵野市",
    weather: {
      condition: "rain",
      currentCelsius: 19,
      lowCelsius: 17,
      highCelsius: 22,
      rainProbability: 80,
    },
    schedules: [],
  }),
  "rain-going-out": planMorningBriefing({
    date: "2026-09-02",
    locationName: "武蔵野市",
    weather: {
      condition: "rain",
      currentCelsius: 19,
      lowCelsius: 17,
      highCelsius: 22,
      rainProbability: 80,
    },
    schedules: [{ title: "外出予定", startTime: "10:00", isAllDay: false }],
    isLikelyGoingOut: true,
  }),
  "rain-staying-home": planMorningBriefing({
    date: "2026-09-02",
    locationName: "武蔵野市",
    weather: {
      condition: "rain",
      currentCelsius: 19,
      lowCelsius: 17,
      highCelsius: 22,
      rainProbability: 80,
    },
    schedules: [],
    isLikelyGoingOut: false,
  }),
  busy: planMorningBriefing({
    date: "2026-09-03",
    locationName: "武蔵野市",
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
    locationName: "武蔵野市",
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
    locationName: "武蔵野市",
    weather: {
      condition: "clear",
      currentCelsius: 28,
      lowCelsius: 25,
      highCelsius: 35,
      rainProbability: 0,
      apparentHighCelsius: 37,
      maxUvIndex: 8,
    },
    schedules: [{ title: "買い物", startTime: "11:00", isAllDay: false }],
  }),
  cold: planMorningBriefing({
    date: "2026-01-15",
    locationName: "武蔵野市",
    weather: {
      condition: "clear",
      currentCelsius: 5,
      lowCelsius: 1,
      highCelsius: 10,
      rainProbability: 0,
      apparentLowCelsius: 2,
      apparentHighCelsius: 8,
    },
    schedules: [],
  }),
  "sunny-uv": planMorningBriefing({
    date: "2026-05-12",
    locationName: "武蔵野市",
    weather: {
      condition: "clear",
      currentCelsius: 20,
      lowCelsius: 14,
      highCelsius: 25,
      rainProbability: 0,
      apparentLowCelsius: 14,
      apparentHighCelsius: 25,
      maxUvIndex: 7,
    },
    schedules: [],
  }),
  windy: planMorningBriefing({
    date: "2026-03-18",
    locationName: "武蔵野市",
    weather: {
      condition: "cloudy",
      currentCelsius: 16,
      lowCelsius: 10,
      highCelsius: 19,
      rainProbability: 10,
      apparentLowCelsius: 8,
      apparentHighCelsius: 18,
      maxWindSpeedKmh: 34,
    },
    schedules: [],
  }),
  "all-day": planMorningBriefing({
    date: "2026-09-06",
    locationName: "武蔵野市",
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
  monday: planMorningBriefing({
    date: "2026-09-07",
    locationName: "武蔵野市",
    weather: {
      condition: "clear",
      currentCelsius: 24,
      lowCelsius: 20,
      highCelsius: 29,
      rainProbability: 0,
    },
    schedules: [],
    upcomingScheduleDays: [
      { date: "2026-09-09", schedules: [{ title: "企画レビュー", startTime: "10:00", isAllDay: false }] },
    ],
  }),
  friday: planMorningBriefing({
    date: "2026-09-11",
    locationName: "武蔵野市",
    weather: {
      condition: "cloudy",
      currentCelsius: 23,
      lowCelsius: 20,
      highCelsius: 27,
      rainProbability: 20,
    },
    schedules: [],
    upcomingScheduleDays: [
      { date: "2026-09-14", schedules: [{ title: "歯科", startTime: "09:30", isAllDay: false }] },
    ],
  }),
};

export function getBriefingScenario(name: BriefingScenarioName): MorningBriefingPlan {
  return scenarios[name];
}
