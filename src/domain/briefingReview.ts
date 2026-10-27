import { planMorningBriefing, type Schedule } from "./morningBriefing.js";
import { applyScheduleRules, type ScheduleRules } from "./personalProfile/scheduleRules.js";

export type BriefingReviewCase = {
  id: string;
  label: string;
  date: string;
  schedules: Schedule[];
  required: string[];
  forbidden: string[];
  once: string[];
  ordered?: string[];
  facts?: Array<{ event: string; startTime: string | null; place?: string }>;
};
export type BriefingReviewFixture = {
  profile: { cookingPlace: string; rules: ScheduleRules };
  cases: BriefingReviewCase[];
};
export type BriefingReviewCheck = { kind: string; expected: string; passed: boolean };

export function createBriefingReviewPlan(scenario: BriefingReviewCase, rules: ScheduleRules) {
  return planMorningBriefing({
    date: scenario.date,
    locationName: "サンプル市",
    weather: { condition: "clear", currentCelsius: 20, lowCelsius: 15, highCelsius: 25, rainProbability: 0 },
    schedules: applyScheduleRules(scenario.schedules, rules),
  });
}

// キーワードと予定ごとの文脈による一次確認。曖昧な文の結び付けは要確認とする。
export function reviewBriefingText(scenario: BriefingReviewCase, text: string, cookingPlace: string): BriefingReviewCheck[] {
  const escapedPlace = cookingPlace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = (value: string) => value.replaceAll("{{cookingPlace}}", escapedPlace);
  const checks: BriefingReviewCheck[] = [
    { kind: "nonempty", expected: "原稿が空でない", passed: text.trim().length > 0 },
    ...scenario.required.map(value => ({ kind: "required", expected: pattern(value), passed: new RegExp(pattern(value), "u").test(text) })),
    ...scenario.forbidden.map(value => ({ kind: "forbidden", expected: pattern(value), passed: !new RegExp(pattern(value), "u").test(text) })),
    ...scenario.once.map(value => ({ kind: "once", expected: value, passed: text.split(value).length === 2 })),
  ];
  let previous = -1;
  for (const value of scenario.ordered ?? []) {
    const index = text.indexOf(value);
    checks.push({ kind: "order", expected: value, passed: index > previous });
    previous = index === -1 ? previous : index;
  }
  const facts = scenario.facts ?? [];
  const contexts = eventContexts(text.normalize("NFKC"), facts.map(fact => pattern(fact.event).normalize("NFKC")));
  for (const [index, fact] of facts.entries()) {
    const units = contexts[index];
    const times = units.map(unit => clockTimes(unit));
    checks.push({ kind: "event-time", expected: `${fact.event}: ${fact.startTime ?? "時刻を付けない"}`,
      passed: units.length > 0 && units.every(unit => unit.length > 0) && times.every(values => fact.startTime === null
        ? values.length === 0
        : values.length > 0 && values.every(value => value.time === fact.startTime)) });
    const place = fact.place;
    if (place) checks.push({ kind: "event-place", expected: `${fact.event}: ${pattern(place)}`,
      passed: units.length > 0 && units.every(unit => new RegExp(pattern(place).normalize("NFKC"), "u").test(unit)) });
  }
  return checks;
}

function clockTimes(text: string) {
  const numeric = [...text.matchAll(/(?<![\d:])(?:(午前|午後)\s*)?(\d{1,2})(?::([0-5]\d)|時(?:([0-5]?\d)分|(半))?)/gu)]
    .map(match => {
      let hour = Number(match[2]);
      if (hour > 23 || (match[1] && (hour < 1 || hour > 12))) return { index: match.index!, time: "unparsed" };
      if (match[1]) hour = hour % 12 + (match[1] === "午後" ? 12 : 0);
      return { index: match.index!, time: `${String(hour).padStart(2, "0")}:${match[5] ? "30" : String(Number(match[3] ?? match[4] ?? 0)).padStart(2, "0")}` };
    });
  // 解釈に対応していない漢数字も、時刻がないことにはしない。
  const other = [...text.matchAll(/[〇零一二三四五六七八九十百]+時|正午/gu)]
    .map(match => ({ index: match.index!, time: match[0] === "正午" ? "12:00" : "unparsed" }));
  return [...numeric, ...other].sort((a, b) => a.index - b.index);
}

function eventContexts(text: string, events: string[]): string[][] {
  const contexts: string[][] = events.map(() => []);
  for (const sentence of text.split(/[。！？!?\n；;]/u)) {
    const mentions = events.flatMap((event, eventIndex) => [...sentence.matchAll(new RegExp(event, "gu"))]
      .map(match => ({ eventIndex, start: match.index!, end: match.index! + match[0].length })))
      .sort((a, b) => a.start - b.start);
    const boundaries = [0];
    let ambiguous = false;
    for (let index = 1; index < mentions.length; index++) {
      const before = mentions[index - 1], after = mentions[index];
      if (before.end > after.start) { ambiguous = true; break; }
      const gap = sentence.slice(before.end, after.start);
      const time = clockTimes(gap).at(-1);
      const comma = Math.max(gap.lastIndexOf("、"), gap.lastIndexOf(","));
      // 次の時刻、または読点で分離できない複数予定は、関連付けを断定しない。
      if (!time && comma < 0) { ambiguous = true; break; }
      boundaries.push(before.end + (time?.index ?? comma + 1));
    }
    if (ambiguous) {
      for (const mention of mentions) contexts[mention.eventIndex].push("");
      continue;
    }
    boundaries.push(sentence.length);
    mentions.forEach((mention, index) => contexts[mention.eventIndex].push(sentence.slice(boundaries[index], boundaries[index + 1])));
  }
  return contexts;
}
