import { DateTime } from "luxon";
export type ReportIssue = { stage: string; code: string; fatal: boolean };
export type IssueRecorder = (stage: string, code: string) => void;
export type ErrorReport = { id: string; date: string; timeZone: string; platform: string; issues: ReportIssue[] };

export function safeErrorCode(error: unknown): string {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599
    ? `HTTP_${status}` : "FAILED";
}

export function formatErrorReport(report: ErrorReport): { subject: string; text: string } {
  const parsed = DateTime.fromISO(report.date, { zone: report.timeZone });
  const day = parsed.isValid ? parsed.toFormat("M/d") : "日付不明";
  const timestamp = parsed.isValid ? parsed.toFormat("M/d HH:mm:ss") : report.date;
  const result = report.issues.some(issue => issue.fatal) ? "処理中止" : "一部機能の失敗";
  return {
    subject: `ohayo-bot エラーレポート（${day}）【${result}】`,
    text: [`ohayo-bot エラーレポート`, `実行日時: ${timestamp} (${report.timeZone})`,
      `実行ID: ${report.id}`, `端末: ${report.platform}`, `結果: ${result}`,
      "リトライを含む処理の後も残った失敗です。",
      ...report.issues.map(issue => `・${issue.stage}: ${issueDescription(issue.code)}（${issue.code}）`),
      "認証・接続設定と端末のローカルログをご確認ください。"].join("\n"),
  };
}

function issueDescription(code: string): string {
  const descriptions: Record<string, string> = {
    FAILED: "処理に失敗しました", EMPTY_SCRIPT: "空の原稿が返されました",
    FETCH_OR_PARSE_FAILED: "公式情報を取得または解析できませんでした",
    STALE_INFORMATION: "公式情報の更新時刻が古い、または不正でした",
    CLOSING_MISSING: "再生成後も音声の末尾欠落が残りました",
    VALIDATION_FAILED: "音声末尾の検査に失敗したため、生成音声をそのまま使用しました",
    VALIDATION_SKIPPED: "残り時間が不足し、音声末尾の検査を省略しました",
    SILENCE_MEASUREMENT_FAILED: "終端の無音を計測できませんでした",
    APPEND_FAILED: "締め挨拶の補完に失敗しました",
    CLEANUP_FAILED: "古い診断データを削除できませんでした",
    DIRECTORY_FAILED: "診断データの保存先を作成できませんでした",
    AUDIO_SAVE_FAILED: "診断用音声を保存できませんでした",
    METADATA_SAVE_FAILED: "診断結果を保存できませんでした",
  };
  return descriptions[code] ?? "接続先からエラーが返されました";
}
