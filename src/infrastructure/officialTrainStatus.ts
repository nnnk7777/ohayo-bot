import type { IssueRecorder } from "../domain/errorReport.js";
import { DateTime } from "luxon";
import type { Today, TrainStatusProvider } from "../application/ports.js";
import type { CommuteSegment } from "../domain/personalProfile/dailyRoutine.js";
import type { TrainOperationStatus } from "../domain/trainOperation.js";

type FetchResponse = {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
};

type Fetcher = (url: string, init?: RequestInit) => Promise<FetchResponse>;

type ParsedStatus = {
  state: "normal" | "disrupted";
  detail?: string;
  checkedAt: DateTime;
};

const maximumAgeMinutes = 30;
const tokyoMetroStatusUrl = "https://www.tokyometro.jp/library/common/operation/status.json";

export class OfficialTrainStatusProvider implements TrainStatusProvider {
  constructor(
    private readonly segments: readonly CommuteSegment[],
    private readonly fetcher: Fetcher = fetch,
    private readonly now: () => Date = () => new Date(),
    private readonly recordIssue?: IssueRecorder,
  ) {}

  async getStatuses(today: Today): Promise<TrainOperationStatus[]> {
    return Promise.all(this.segments.map((segment) => this.getStatus(segment, today)));
  }

  private async getStatus(segment: CommuteSegment, today: Today): Promise<TrainOperationStatus> {
    try {
      const requestUrl = segment.source.kind === "tokyo-metro" ? tokyoMetroStatusUrl : segment.source.officialUrl;
      const response = await this.fetcher(requestUrl, {
        headers: {
          "user-agent": "Mozilla/5.0",
          "accept-language": "ja",
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const parsed = segment.source.kind === "jr-east"
        ? parseJrEastStatus(html, today.timeZone)
        : parseTokyoMetroStatus(
            html,
            segment.source.lineId,
            today.timeZone,
            response.headers?.get("date") ?? undefined,
          );
      const ageMinutes = DateTime.fromJSDate(this.now(), { zone: today.timeZone }).diff(parsed.checkedAt, "minutes").minutes;
      if (ageMinutes < -5 || ageMinutes > maximumAgeMinutes) {
        this.recordIssue?.("電車情報取得", "STALE_INFORMATION");
        return unknownStatus(segment, "公式情報の更新時刻が古いため、現在の運行状況を確認できませんでした。");
      }

      return {
        lineName: segment.lineName,
        state: parsed.state,
        detail: parsed.detail,
        checkedAt: parsed.checkedAt.toISO() ?? undefined,
        sourceUrl: segment.source.officialUrl,
      };
    } catch {
      this.recordIssue?.("電車情報取得", "FETCH_OR_PARSE_FAILED");
      return unknownStatus(segment, "公式情報を取得できず、現在の運行状況を確認できませんでした。");
    }
  }
}

export function parseJrEastStatus(html: string, timeZone: string): ParsedStatus {
  const updatedMatch = html.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2})時(\d{1,2})分\s*現在/);
  const sectionStart = html.indexOf('id="susp_service_info"');
  const historyStart = html.indexOf("<!--運行情報更新履歴-->", sectionStart);
  if (!updatedMatch || sectionStart < 0) throw new Error("JR東日本の運行情報を解析できませんでした。");
  const currentSection = html.slice(sectionStart, historyStart > sectionStart ? historyStart : undefined);
  const statusMatch = currentSection.match(/traininfo-line-info__status[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/);
  if (!statusMatch) throw new Error("JR東日本の現在の運行状態を解析できませんでした。");

  const statusLabel = text(statusMatch[1] ?? "");
  const noteMatch = currentSection.match(/traininfo-line-info__note[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
  return {
    state: isNormal(statusLabel) ? "normal" : "disrupted",
    detail: noteMatch ? text(noteMatch[1] ?? "") : undefined,
    checkedAt: dateTimeFromMatch(updatedMatch, timeZone),
  };
}

export function parseTokyoMetroStatus(
  body: string,
  lineId: string,
  timeZone: string,
  responseDate?: string,
): ParsedStatus {
  if (!responseDate) throw new Error("東京メトロ公式情報の応答時刻がありません。");
  const checkedAt = DateTime.fromHTTP(responseDate, { zone: "utc" }).setZone(timeZone);
  if (!checkedAt.isValid) throw new Error("東京メトロ公式情報の応答時刻を解析できませんでした。");

  const jsonText = body.trim().replace(/^operate_status_cb_func\s*\(/, "").replace(/\);?\s*$/, "");
  const data = JSON.parse(jsonText) as {
    jp?: { lines?: Array<{ name_alpha_db?: string; status_icon?: string; status_info?: string; contents?: string }> };
  };
  const line = data.jp?.lines?.find((item) => item.name_alpha_db === lineId);
  if (!line?.status_icon || !line.status_info) {
    throw new Error("東京メトロの現在の運行状態を解析できませんでした。");
  }

  const statusLabel = line.status_info.trim();
  return {
    state: line.status_icon === "heijou" || isNormal(statusLabel) ? "normal" : "disrupted",
    detail: line.contents?.trim() || statusLabel,
    checkedAt,
  };
}

function unknownStatus(segment: CommuteSegment, detail: string): TrainOperationStatus {
  return {
    lineName: segment.lineName,
    state: "unknown",
    detail,
    sourceUrl: segment.source.officialUrl,
  };
}

function dateTimeFromMatch(match: RegExpMatchArray, timeZone: string): DateTime {
  const value = DateTime.fromObject({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  }, { zone: timeZone });
  if (!value.isValid) throw new Error("公式情報の更新時刻を解析できませんでした。");
  return value;
}

function isNormal(label: string): boolean {
  return /平常運転|平常どおり|通常運行/.test(label);
}

function text(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
