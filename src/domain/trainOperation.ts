export type TrainOperationStatus = {
  lineName: string;
  state: "normal" | "disrupted" | "unknown";
  detail?: string;
  checkedAt?: string;
  sourceUrl: string;
};

export type CommuteIssue = Omit<TrainOperationStatus, "state"> & {
  state: "disrupted" | "unknown";
};

export function commuteIssues(statuses: TrainOperationStatus[]): CommuteIssue[] {
  return statuses.filter((status): status is CommuteIssue => status.state !== "normal");
}
