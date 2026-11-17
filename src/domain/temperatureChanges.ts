export type TemperatureComparison = {
  previousDayHighCelsius?: number;
  daytimeHighCelsius?: number;
  eveningLowCelsius?: number;
};

export type TemperatureChanges = {
  previousDay?: { direction: "warmer" | "colder"; differenceCelsius: number };
  evening?: { daytimeHighCelsius: number; eveningLowCelsius: number; dropCelsius: number };
};

// 毎日の小さな差は省き、服装を考える材料になる変化だけを渡す。
export function temperatureChanges(highCelsius: number, comparison: TemperatureComparison): TemperatureChanges | undefined {
  const changes: TemperatureChanges = {};
  const previous = comparison.previousDayHighCelsius;
  if (finite(highCelsius) && finite(previous)) {
    const difference = Math.round(highCelsius) - Math.round(previous);
    if (Math.abs(difference) >= 5) changes.previousDay = {
      direction: difference > 0 ? "warmer" : "colder", differenceCelsius: Math.abs(difference),
    };
  }
  const day = comparison.daytimeHighCelsius;
  const evening = comparison.eveningLowCelsius;
  if (finite(day) && finite(evening)) {
    const drop = Math.round(day) - Math.round(evening);
    if (drop >= 7 && evening <= 18) changes.evening = {
      daytimeHighCelsius: Math.round(day), eveningLowCelsius: Math.round(evening), dropCelsius: drop,
    };
  }
  return Object.keys(changes).length ? changes : undefined;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
