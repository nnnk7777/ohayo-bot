export type PollenForecast = {
  date: string;
  types: { kind: "grass" | "tree" | "weed"; level: "high" | "very-high" }[];
};

// 外部APIの説明文・健康アドバイスは原稿へ渡さず、確認した指数だけを使う。
export function parsePollenForecast(data: unknown, date: string): PollenForecast | undefined {
  if (!data || typeof data !== "object" || !("dailyInfo" in data) || !Array.isArray(data.dailyInfo)) {
    throw new Error("花粉APIの応答形式が不正です。");
  }
  const day = data.dailyInfo.find(day => day && typeof day === "object" &&
    day.date && `${day.date.year}-${String(day.date.month).padStart(2, "0")}-${String(day.date.day).padStart(2, "0")}` === date);
  if (!day || !Array.isArray(day.pollenTypeInfo)) throw new Error("花粉APIの応答に当日の情報がありません。");
  const kinds = { GRASS: "grass", TREE: "tree", WEED: "weed" } as const;
  const types: PollenForecast["types"] = [];
  for (const item of day.pollenTypeInfo) {
    if (!item || typeof item !== "object" || !Object.hasOwn(kinds, item.code) || item.inSeason === false) continue;
    const index = item.indexInfo;
    if (index?.code !== "UPI" || (index.value !== 4 && index.value !== 5)) continue;
    const kind = kinds[item.code as keyof typeof kinds];
    if (!types.some(type => type.kind === kind)) types.push({ kind, level: index.value === 5 ? "very-high" : "high" });
  }
  return types.length ? { date, types } : undefined;
}
