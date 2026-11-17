import { describe, expect, it } from "vitest";
import { temperatureChanges } from "./temperatureChanges.js";

describe("temperatureChanges", () => {
  it.each([[18, 25, "colder", 7], [25, 20, "warmer", 5]] as const)("最高気温%s度、昨日%s度の大きな差を案内する", (high, previous, direction, differenceCelsius) => {
    expect(temperatureChanges(high, { previousDayHighCelsius: previous })).toEqual({ previousDay: { direction, differenceCelsius } });
  });
  it("読み上げる整数気温と差を一致させ、小さな変化は省く", () => {
    expect(temperatureChanges(20.4, { previousDayHighCelsius: 24.6 })?.previousDay?.differenceCelsius).toBe(5);
    expect(temperatureChanges(20, { previousDayHighCelsius: 24 })).toBeUndefined();
  });
  it("日中から夜に7度以上下がり、夜18度以下なら案内する", () => {
    expect(temperatureChanges(25, { daytimeHighCelsius: 25, eveningLowCelsius: 18 })).toEqual({
      evening: { daytimeHighCelsius: 25, eveningLowCelsius: 18, dropCelsius: 7 },
    });
  });
  it.each([
    {}, { daytimeHighCelsius: 25 }, { eveningLowCelsius: 10 },
    { daytimeHighCelsius: 24, eveningLowCelsius: 18 },
    { daytimeHighCelsius: 35, eveningLowCelsius: 25 },
    { previousDayHighCelsius: NaN }, { previousDayHighCelsius: Infinity },
    { daytimeHighCelsius: 25, eveningLowCelsius: NaN },
  ])("欠損や小さな変化、暑い夜に冷え込みを作らない: %j", comparison => {
    expect(temperatureChanges(25, comparison)).toBeUndefined();
  });
});
