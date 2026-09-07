import type { Schedule } from "../morningBriefing.js";

export type ScheduleTitleRule = {
  title: string;
  briefingTitle: string;
  requiresGoingOut?: boolean;
};

export type SchedulePrefixRule = {
  prefix: string;
  hint: string;
  suggestsGoingOut?: boolean;
  detailHints?: readonly ScheduleTitleDetailHint[];
};

export type ScheduleTitleDetailHint = {
  detail: string;
  hint: string;
};

export type ScheduleSuffixRule = {
  suffix: string;
  titlePrefix?: string;
  hint: string;
};

export type ScheduleRules = {
  excludedTitles: readonly string[];
  excludedTitleFragments: readonly string[];
  exactTitleRules: readonly ScheduleTitleRule[];
  prefixRules: readonly SchedulePrefixRule[];
  suffixRules: readonly ScheduleSuffixRule[];
  personOnlyTitles: readonly string[];
};

// Calendar上の短縮表記を、朝の原稿に渡す補助情報へ変換する。
// 絵文字はタイトルや説明欄より弱い情報なので、予定名そのものは変えない。
export function applyScheduleRules(schedules: Schedule[], rules: ScheduleRules): Schedule[] {
  return schedules
    .filter((schedule) => !isExcluded(schedule.title, rules))
    .map((schedule) => ({ ...schedule, ...presentationFor(schedule, rules) }));
}

function presentationFor(
  schedule: Schedule,
  rules: ScheduleRules,
): Pick<Schedule, "title" | "requiresGoingOut" | "briefingHints"> {
  const { title } = schedule;
  const exactRule = rules.exactTitleRules.find((rule) => rule.title === title);
  if (exactRule) {
    return { title: exactRule.briefingTitle, requiresGoingOut: exactRule.requiresGoingOut };
  }

  const prefixRule = rules.prefixRules.find((rule) => title.startsWith(rule.prefix));
  if (prefixRule) {
    const detail = title.slice(prefixRule.prefix.length).trim();
    const detailHint = prefixRule.detailHints?.find((item) => item.detail === detail);
    return {
      title,
      briefingHints: [prefixRule.hint, ...(detailHint ? [detailHint.hint] : [])],
      requiresGoingOut: prefixRule.suggestsGoingOut,
    };
  }

  const suffixRule = rules.suffixRules.find((rule) => (
    title.endsWith(rule.suffix) && (!rule.titlePrefix || title.startsWith(rule.titlePrefix))
  ));
  if (suffixRule) return { title, briefingHints: [suffixRule.hint] };

  if (rules.personOnlyTitles.includes(title)) return { title: `${title}さんと一緒に遊びに出かける予定` };

  return { title };
}

function isExcluded(title: string, rules: ScheduleRules): boolean {
  return rules.excludedTitles.includes(title) || rules.excludedTitleFragments.some((fragment) => title.includes(fragment));
}
