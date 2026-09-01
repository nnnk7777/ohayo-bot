import { describe, expect, it } from "vitest";
import { isLikelyGoingOut } from "./dailyRoutine.js";

describe("dailyRoutine", () => {
  it("出社曜日は外出見込みになる", () => {
    expect(isLikelyGoingOut({ date: "2026-09-02", schedules: [] })).toBe(true);
  });

  it("リモート曜日は外出予定がなければ外出見込みにならない", () => {
    expect(isLikelyGoingOut({ date: "2026-09-01", schedules: [] })).toBe(false);
  });

  it("予定の場所や通院は曜日に関わらず外出見込みになる", () => {
    expect(isLikelyGoingOut({ date: "2026-09-01", schedules: [{ title: "打合せ", location: "渋谷", isAllDay: false }] })).toBe(true);
    expect(isLikelyGoingOut({ date: "2026-09-06", schedules: [{ title: "歯科", isAllDay: false }] })).toBe(true);
  });
});
