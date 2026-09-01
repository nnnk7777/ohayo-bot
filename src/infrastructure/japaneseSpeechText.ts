const KANJI_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function toJapaneseSpeechText(text: string): string {
  return text.replace(/(\d{1,2})月(\d{1,2})日/g, (original, monthText: string, dayText: string) => {
    const month = Number(monthText);
    const day = Number(dayText);
    return month >= 1 && month <= 12 && day >= 1 && day <= 31
      ? `${toKanjiNumber(month)}月${toKanjiNumber(day)}日`
      : original;
  });
}

function toKanjiNumber(value: number): string {
  if (value < 10) return KANJI_DIGITS[value];
  if (value === 10) return "十";
  if (value < 20) return `十${KANJI_DIGITS[value - 10]}`;

  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${KANJI_DIGITS[tens]}十${KANJI_DIGITS[ones]}`;
}
