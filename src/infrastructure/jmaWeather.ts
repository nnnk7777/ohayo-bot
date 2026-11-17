import { DateTime } from "luxon";
import type { RegionalWeatherProvider, Today } from "../application/ports.js";
import type { RegionalWeatherForecast } from "../domain/morningBriefing.js";

type ForecastArea = {
  area: { code: string; name: string };
  weathers?: string[];
  pops?: string[];
};

type ForecastReport = {
  reportDatetime: string;
  timeSeries: { timeDefines: string[]; areas: ForecastArea[] }[];
};

export class JmaWeatherProvider implements RegionalWeatherProvider {
  constructor(private readonly officeCode: string, private readonly areaCode: string) {}

  async getForecast(today: Today): Promise<RegionalWeatherForecast> {
    const response = await fetch(`https://www.jma.go.jp/bosai/forecast/data/forecast/${this.officeCode}.json`, {
      signal: AbortSignal.timeout(6_000),
      redirect: "error",
    });
    if (!response.ok) {
      throw Object.assign(new Error("気象庁の地域予報を取得できませんでした。"), { status: response.status });
    }
    const reports: unknown = await response.json();
    return readForecast(reports, this.areaCode, today);
  }
}

function readForecast(value: unknown, areaCode: string, today: Today): RegionalWeatherForecast {
  const now = DateTime.now();
  const from = DateTime.fromISO(`${today.date}T${today.time ?? "00:00"}`, { zone: today.timeZone });
  const reports = Array.isArray(value) ? value as ForecastReport[] : [];

  // 短期予報の当日分だけを使う。週間予報には天気の文章がない。
  for (const report of reports) {
    const issued = DateTime.fromISO(report.reportDatetime, { setZone: true });
    const age = now.diff(issued, "hours").hours;
    if (!issued.isValid || age < 0 || age > 18 || !from.isValid) continue;

    const forecast = report.timeSeries.find(series =>
      series.areas.some(area => area.area.code === areaCode && Array.isArray(area.weathers)));
    const area = forecast?.areas.find(item => item.area.code === areaCode && Array.isArray(item.weathers));
    const dayIndex = forecast?.timeDefines.findIndex(time =>
      DateTime.fromISO(time, { zone: today.timeZone }).toISODate() === today.date) ?? -1;
    const summary = area?.weathers?.[dayIndex]?.trim();
    const areaName = area?.area.name?.trim();
    if (!summary || !areaName) continue;

    const rain = report.timeSeries.find(series =>
      series.areas.some(item => item.area.code === areaCode && Array.isArray(item.pops)));
    const probabilities = rain?.areas.find(item => item.area.code === areaCode)?.pops;
    const hasUpcomingRainRisk = rain?.timeDefines.some((time, index) => {
      const start = DateTime.fromISO(time, { zone: today.timeZone });
      const probability = probabilities?.[index];
      // POP はラベル時刻に始まる6時間の予報。
      return start.toISODate() === today.date && start.plus({ hours: 6 }) > from &&
        probability !== undefined && /^(?:[4-9]0|100)$/.test(probability);
    }) ?? false;
    return { areaName, summary: summary.replace(/\s+/g, " "), hasUpcomingRainRisk };
  }
  throw new Error("気象庁の対象地域に有効な当日予報がありません。");
}
