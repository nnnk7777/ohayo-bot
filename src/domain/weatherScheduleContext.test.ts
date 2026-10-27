import { describe, expect, it } from "vitest";
import type { HourlyPrecipitation, Schedule } from "./morningBriefing.js";
import { selectWeatherScheduleContext } from "./weatherScheduleContext.js";

const dinner: Schedule = { title: "食事", startTime: "19:00", isAllDay: false, requiresGoingOut: true };
const rain: HourlyPrecipitation = {
  startTime: "19:00", endTime: "20:00", precipitationProbability: 70, rainMillimeters: 0.4,
};

describe("selectWeatherScheduleContext", () => {
  it("開始時刻を含む降水予報と外出予定の事実だけを返す", () => {
    expect(selectWeatherScheduleContext([dinner], [rain])).toEqual({
      kind: "rain-near-schedule",
      schedule: { title: "食事", startTime: "19:00" },
      forecast: { startTime: "19:00", endTime: "20:00", precipitationProbability: 70, rainMillimeters: 0.4, intensity: "light" },
    });
  });

  it.each([
    [0.1, "light"], [2.99, "light"], [3, "normal"], [9.99, "normal"], [10, "stronger"], [30, "stronger"],
  ] as const)("雨量%smm/hから注意の強さ%sと根拠を渡す", (rainMillimeters, intensity) => {
    const result = selectWeatherScheduleContext([dinner], [{ ...rain, rainMillimeters }]);
    expect(result?.forecast).toMatchObject({ rainMillimeters, intensity });
  });

  it("降水確率の高低で雨の強さを変えない", () => {
    const light = selectWeatherScheduleContext([dinner], [{ ...rain, precipitationProbability: 100 }]);
    const stronger = selectWeatherScheduleContext([dinner], [{ ...rain, precipitationProbability: 40, rainMillimeters: 12 }]);
    expect(light?.forecast.intensity).toBe("light");
    expect(stronger?.forecast.intensity).toBe("stronger");
  });

  it("外出の根拠がある最も早い該当予定を最大1件選び、入力順序は変えない", () => {
    const later = { ...dinner, title: "通院", startTime: "19:30" };
    const schedules = [later, dinner];
    expect(selectWeatherScheduleContext(schedules, [rain])?.schedule.title).toBe("食事");
    expect(schedules).toEqual([later, dinner]);
  });

  it("外出の根拠がある場所や予定名を既存のルールと同じ条件で扱う", () => {
    expect(selectWeatherScheduleContext([{ ...dinner, requiresGoingOut: undefined, location: "サンプル会場" }], [rain])).toBeDefined();
    expect(selectWeatherScheduleContext([{ ...dinner, title: "歯科", requiresGoingOut: undefined }], [rain])).toBeDefined();
  });

  it.each<Partial<Schedule>>([
    { isAllDay: true }, { startTime: undefined }, { startTime: "24:00" },
    { startTime: "19:99" }, { startTime: "9:00" },
    { requiresGoingOut: undefined },
    { title: "オンライン食事会" },
    { location: "https://meet.google.com/example" },
  ])("終日・不明・オンラインの予定は結び付けない: %j", change => {
    expect(selectWeatherScheduleContext([{ ...dinner, ...change }], [rain])).toBeUndefined();
  });

  it("雨の時間帯がずれていれば、出発や帰宅を推測して結び付けない", () => {
    expect(selectWeatherScheduleContext([{ ...dinner, startTime: "20:00" }], [rain])).toBeUndefined();
    expect(selectWeatherScheduleContext([{ ...dinner, startTime: "18:59" }], [rain])).toBeUndefined();
  });

  it.each<Partial<HourlyPrecipitation>>([
    { precipitationProbability: 39 }, { precipitationProbability: 101 },
    { precipitationProbability: NaN }, { rainMillimeters: 0 },
    { rainMillimeters: -1 }, { rainMillimeters: Infinity },
    { startTime: "19:99" }, { endTime: "19:00" }, { endTime: "21:00" },
  ])("曖昧・低確率・雨量なし・不正な時間帯は使わない: %j", change => {
    expect(selectWeatherScheduleContext([dinner], [{ ...rain, ...change }])).toBeUndefined();
  });

  it("しきい値の40%、0.1mmを含み、23時台の予定にも対応する", () => {
    const period = { ...rain, startTime: "23:00", endTime: "24:00", precipitationProbability: 40, rainMillimeters: 0.1 };
    expect(selectWeatherScheduleContext([{ ...dinner, startTime: "23:30" }], [period])).toBeDefined();
  });

  it("予定や時間帯別予報がなければ補足を作らない", () => {
    expect(selectWeatherScheduleContext([], [rain])).toBeUndefined();
    expect(selectWeatherScheduleContext([dinner], [])).toBeUndefined();
  });
});
