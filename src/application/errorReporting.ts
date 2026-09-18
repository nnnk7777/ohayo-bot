import type { ErrorReport, ReportIssue } from "../domain/errorReport.js";
import { safeErrorCode } from "../domain/errorReport.js";

export class ErrorCollector {
  readonly issues: ReportIssue[] = [];
  readonly record = (stage: string, code: string): void => { this.add({ stage, code, fatal: false }); };
  private add(issue: ReportIssue): void {
    if (!this.issues.some(item => item.stage === issue.stage && item.code === issue.code && item.fatal === issue.fatal)) this.issues.push(issue);
  }
  fatal(stage: string, error: unknown, code = safeErrorCode(error)): void {
    this.add({ stage, code, fatal: true });
  }
  async track<T>(stage: string, work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      if (!this.issues.some(issue => issue.stage === stage && issue.code === "EMPTY_SCRIPT")) this.fatal(stage, error);
      throw error;
    }
  }
}

export async function settleValues<T extends readonly unknown[]>(tasks: { [K in keyof T]: Promise<T[K]> }): Promise<T> {
  const results = await Promise.allSettled(tasks);
  const failure = results.find(result => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return results.map(result => (result as PromiseFulfilledResult<unknown>).value) as unknown as T;
}

export async function deliverErrorReport(report: ErrorReport, send: (report: ErrorReport) => Promise<void>, save: (report: ErrorReport) => Promise<void>): Promise<void> {
  if (!report.issues.length) return;
  try { await send(report); }
  catch {
    console.error("エラーレポートのメール送信に失敗しました。ローカルに保存します。");
    try { await save(report); }
    catch { console.error("エラーレポートのローカル保存にも失敗しました。"); }
  }
}
