import { describe, expect, it } from "vitest";
import { isLikelyGoingOut } from "./dailyRoutine.js";

const dailyRoutine = { officeWeekdays: [1, 3, 4] as const, remoteWeekdays: [2, 5] as const };

describe("dailyRoutine", () => {
  it("出社曜日は外出見込みになる", () => {
    expect(isLikelyGoingOut({ date: "2026-09-02", schedules: [], dailyRoutine })).toBe(true);
  });

  it("リモート曜日は外出予定がなければ外出見込みにならない", () => {
    expect(isLikelyGoingOut({ date: "2026-09-01", schedules: [], dailyRoutine })).toBe(false);
  });

  it("祝日は出社曜日より優先する", () => {
    expect(isLikelyGoingOut({ date: "2026-09-02", isHoliday: true, schedules: [], dailyRoutine })).toBe(false);
  });

  it("予定の場所や通院は曜日に関わらず外出見込みになる", () => {
    expect(isLikelyGoingOut({ date: "2026-09-01", schedules: [{ title: "打合せ", location: "渋谷", isAllDay: false }], dailyRoutine })).toBe(true);
    expect(isLikelyGoingOut({ date: "2026-09-06", schedules: [{ title: "歯科", isAllDay: false }], dailyRoutine })).toBe(true);
  });

  it("個人ルールで外出と分かる予定は曜日に関わらず外出見込みになる", () => {
    expect(isLikelyGoingOut({
      date: "2026-09-01",
      schedules: [{ title: "美容院の予約", isAllDay: false, requiresGoingOut: true }],
      dailyRoutine,
    })).toBe(true);
  });

  it("明示した在宅勤務は出社曜日より優先する", () => {
    expect(isLikelyGoingOut({
      date: "2026-09-02",
      schedules: [{ title: "在宅勤務の日", isAllDay: true }],
      dailyRoutine,
    })).toBe(false);
  });

  it("在宅勤務の日でも外出予定があれば外出見込みになる", () => {
    expect(isLikelyGoingOut({
      date: "2026-09-02",
      schedules: [
        { title: "在宅勤務の日", isAllDay: true },
        { title: "歯科", isAllDay: false },
      ],
      dailyRoutine,
    })).toBe(true);
  });
});
