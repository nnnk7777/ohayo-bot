import { afterEach, expect, it, vi } from "vitest";
import { runMorningBriefing } from "./runMorningBriefing.js";
import { ErrorCollector } from "./errorReporting.js";
import type { MorningBriefingPlan } from "../domain/morningBriefing.js";

const today = { date: "2026-04-01", timeZone: "Asia/Tokyo" };
const pollen = { date: today.date, types: [{ kind: "tree", level: "high" }] } as const;
const makeDependencies = () => ({
  personalProfile: { dailyRoutine: { officeWeekdays: [], remoteWeekdays: [] },
    scheduleRules: { excludedTitles: [], excludedTitleFragments: [], exactTitleRules: [], prefixRules: [], suffixRules: [], personOnlyTitles: [] } },
  weatherProvider: { getWeather: vi.fn().mockResolvedValue({ condition: "clear", currentCelsius: 18,
    lowCelsius: 10, highCelsius: 25, rainProbability: 0, previousDayHighCelsius: 30, daytimeHighCelsius: 25, eveningLowCelsius: 15 }) },
  scheduleProvider: { getSchedules: vi.fn().mockResolvedValue([]) },
  holidayProvider: { isHoliday: vi.fn().mockResolvedValue(false) },
  pollenProvider: { getForecast: vi.fn().mockResolvedValue(pollen) },
  yellowDustProvider: { getNotice: vi.fn().mockResolvedValue({ date: today.date, area: "サンプル県" }) },
  narrator: { narrate: vi.fn(async (_plan: MorningBriefingPlan) => "テスト用の原稿です。") },
  speaker: { speak: vi.fn() },
  errors: new ErrorCollector(),
});

afterEach(() => vi.restoreAllMocks());

it("気温差・花粉・黄砂を1回の原稿生成へ渡し、時間別の生データやキーを渡さない", async () => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  const dependencies = makeDependencies();
  await runMorningBriefing(dependencies, { today, speak: false });
  expect(dependencies.narrator.narrate).toHaveBeenCalledTimes(1);
  const plan = dependencies.narrator.narrate.mock.calls[0][0];
  expect(plan.weather).toMatchObject({
    temperatureChanges: { previousDay: { direction: "colder", differenceCelsius: 5 },
      evening: { daytimeHighCelsius: 25, eveningLowCelsius: 15, dropCelsius: 10 } },
    pollen, yellowDust: { date: today.date, area: "サンプル県" },
  });
  expect(plan.weather).not.toHaveProperty("previousDayHighCelsius");
  expect(dependencies.pollenProvider.getForecast).toHaveBeenCalledWith(today);
  expect(dependencies.speaker.speak).not.toHaveBeenCalled();
});

it.each(["pollenProvider", "yellowDustProvider"] as const)("%sの失敗時も天気・原稿・再生を継続し、生エラーを出力しない", async key => {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const dependencies = makeDependencies();
  if (key === "pollenProvider") dependencies.pollenProvider.getForecast.mockRejectedValue(new Error("fixture-secret"));
  else dependencies.yellowDustProvider.getNotice.mockRejectedValue(new Error("fixture-secret"));
  await runMorningBriefing(dependencies, { today, speak: true });
  const plan = dependencies.narrator.narrate.mock.calls[0][0];
  expect(plan.weather[key === "pollenProvider" ? "pollen" : "yellowDust"]).toBeUndefined();
  expect(plan.weather.temperatureChanges).toBeDefined();
  expect(dependencies.errors.issues).toEqual([{ stage: key === "pollenProvider" ? "花粉取得" : "黄砂取得", code: "FETCH_OR_PARSE_FAILED", fatal: false }]);
  expect(dependencies.speaker.speak).toHaveBeenCalledTimes(1);
  expect(JSON.stringify([...log.mock.calls, ...warn.mock.calls])).not.toContain("fixture-secret");
});

it("設定がない場合は追加取得せず、日付違いの情報も案内しない", async () => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  const dependencies = makeDependencies();
  await runMorningBriefing({ ...dependencies, pollenProvider: undefined, yellowDustProvider: undefined }, { today, speak: false });
  expect(dependencies.pollenProvider.getForecast).not.toHaveBeenCalled();
  expect(dependencies.yellowDustProvider.getNotice).not.toHaveBeenCalled();
  expect(dependencies.narrator.narrate.mock.calls[0][0].weather.pollen).toBeUndefined();
  dependencies.pollenProvider.getForecast.mockResolvedValue({ ...pollen, date: "2026-03-31" });
  dependencies.yellowDustProvider.getNotice.mockResolvedValue({ date: "2026-03-31", area: "サンプル県" });
  await runMorningBriefing(dependencies, { today, speak: false });
  const plan = dependencies.narrator.narrate.mock.calls[1][0];
  expect(plan.weather.pollen).toBeUndefined();
  expect(plan.weather.yellowDust).toBeUndefined();
});

it("実行地点の現地時刻を雨の判断へ渡し、終わった雨で傘を勧めない", async () => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  const dependencies = makeDependencies();
  dependencies.scheduleProvider.getSchedules.mockResolvedValue([
    { title: "架空の訪問", startTime: "12:00", isAllDay: false, requiresGoingOut: true },
  ]);
  dependencies.weatherProvider.getWeather.mockResolvedValue({ condition: "clear", currentCelsius: 20,
    lowCelsius: 15, highCelsius: 25, rainProbability: 90,
    hourlyPrecipitation: [{ startTime: "03:00", endTime: "04:00", precipitationProbability: 90, rainMillimeters: 1 }],
    hourlyConditions: [{ time: "03:00", condition: "rain" }, { time: "15:00", condition: "clear" }],
  });
  await runMorningBriefing(dependencies, { today: { ...today, time: "08:30" }, speak: false });
  expect(dependencies.narrator.narrate.mock.calls[0][0].weather.umbrellaAdvice).toBeUndefined();
  await runMorningBriefing(dependencies, { today: { ...today, time: "02:30" }, speak: false });
  const weather = dependencies.narrator.narrate.mock.calls[1][0].weather;
  expect(weather.umbrellaAdvice).toBeDefined();
  expect(weather.currentCondition).toBe("晴れ");
});

function makeSeason() {
  const notice = { key: "tokyo:2026:cedar", plant: "cedar" as const,
    publishedDate: today.date, startDate: "2026-03-31", sourceUrl: "https://example.com/public-notice",
    announcement: "テスト用の自治体発表です。" };
  return { notice, provider: { getNotices: vi.fn().mockResolvedValue([notice]) },
    history: { read: vi.fn().mockResolvedValue([]), record: vi.fn().mockResolvedValue(undefined) } };
}

it("花粉開始発表を原稿へ渡し、再生完了後だけ紹介済みとする", async () => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  const dependencies = makeDependencies();
  const season = makeSeason();
  dependencies.speaker.speak.mockImplementation(async () => {
    expect(season.history.record).not.toHaveBeenCalled();
  });
  await runMorningBriefing({ ...dependencies, pollenSeason: season }, { today, speak: true });
  expect(dependencies.narrator.narrate.mock.calls[0][0].weather.pollenSeasonStart).toEqual([{ announcement: season.notice.announcement }]);
  expect(dependencies.narrator.narrate).toHaveBeenCalledTimes(1);
  expect(season.history.record).toHaveBeenCalledWith([season.notice.key]);
  expect(season.provider.getNotices).toHaveBeenCalledWith(today, []);
});

it("試し生成・再生失敗では花粉開始を紹介済みにしない", async () => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  const dependencies = makeDependencies();
  const season = makeSeason();
  await runMorningBriefing({ ...dependencies, pollenSeason: season }, { today, speak: false });
  expect(season.history.record).not.toHaveBeenCalled();
  dependencies.speaker.speak.mockRejectedValue(new Error("playback-fixture"));
  await expect(runMorningBriefing({ ...dependencies, pollenSeason: season }, { today, speak: true })).rejects.toThrow();
  expect(season.history.record).not.toHaveBeenCalled();
});

it.each(["history", "provider"] as const)("花粉開始の%s取得失敗は案内だけ省き、通常の花粉・再生を続ける", async target => {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const dependencies = makeDependencies();
  const season = makeSeason();
  if (target === "history") season.history.read.mockRejectedValue(new Error("private-fixture"));
  else season.provider.getNotices.mockRejectedValue(new Error("private-fixture"));
  await runMorningBriefing({ ...dependencies, pollenSeason: season }, { today, speak: true });
  const weather = dependencies.narrator.narrate.mock.calls[0][0].weather;
  expect(weather.pollenSeasonStart).toBeUndefined();
  expect(weather.pollen).toEqual(pollen);
  expect(dependencies.speaker.speak).toHaveBeenCalledTimes(1);
  expect(season.history.record).not.toHaveBeenCalled();
  if (target === "history") expect(season.provider.getNotices).not.toHaveBeenCalled();
  expect(JSON.stringify([...log.mock.calls, ...warn.mock.calls])).not.toContain("private-fixture");
});

it("保存失敗でも再生完了を維持し、紹介済み履歴で翌回の重複を防ぐ", async () => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const dependencies = makeDependencies();
  const season = makeSeason();
  season.history.record.mockRejectedValue(new Error("write-fixture"));
  await runMorningBriefing({ ...dependencies, pollenSeason: season }, { today, speak: true });
  expect(dependencies.errors.issues).toContainEqual({ stage: "花粉開始履歴保存", code: "FAILED", fatal: false });
  season.history.read.mockResolvedValue([season.notice.key]);
  season.provider.getNotices.mockResolvedValue([]);
  await runMorningBriefing({ ...dependencies, pollenSeason: season }, { today, speak: true });
  expect(season.provider.getNotices).toHaveBeenLastCalledWith(today, [season.notice.key]);
  expect(dependencies.narrator.narrate.mock.calls[1][0].weather.pollenSeasonStart).toBeUndefined();
});
