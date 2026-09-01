import { describe, expect, it } from "vitest";
import { toJapaneseSpeechText } from "./japaneseSpeechText.js";

describe("toJapaneseSpeechText", () => {
  it("月日表記を漢数字へ置き換える", () => {
    expect(toJapaneseSpeechText("9月1日、火曜日。10月20日。"))
      .toBe("九月一日、火曜日。十月はつか。");
  });

  it("31日までの月日表記に対応する", () => {
    expect(toJapaneseSpeechText("12月31日です。"))
      .toBe("十二月三十一日です。");
  });

  it("日付として読まれにくい日を、読み仮名に置き換える", () => {
    expect(toJapaneseSpeechText("9月6日と9月20日、9月24日です。"))
      .toBe("九月むいかと九月はつか、九月にじゅうよっかです。");
  });

  it("存在しない月日表記は変えない", () => {
    expect(toJapaneseSpeechText("13月1日と4月32日。"))
      .toBe("13月1日と4月32日。");
  });
});
