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
  const titleKey = titleKeyForMatching(title);
  const exactRule = rules.exactTitleRules.find((rule) => equalTitleKeys(titleKey, rule.title));
  if (exactRule) {
    return { title: exactRule.briefingTitle, requiresGoingOut: exactRule.requiresGoingOut };
  }

  const prefixRule = rules.prefixRules.find((rule) => {
    const prefix = titleKeyForMatching(rule.prefix);
    return prefix.length > 0 && titleKey.startsWith(prefix);
  });
  if (prefixRule) {
    const detail = titleKey.slice(titleKeyForMatching(prefixRule.prefix).length).trim();
    const detailHint = prefixRule.detailHints?.find((item) => equalTitleKeys(detail, item.detail));
    return {
      title,
      briefingHints: [prefixRule.hint, ...(detailHint ? [detailHint.hint] : [])],
      requiresGoingOut: prefixRule.suggestsGoingOut,
    };
  }

  const suffixRule = rules.suffixRules.find((rule) => {
    const suffix = titleKeyForMatching(rule.suffix);
    const prefix = rule.titlePrefix === undefined ? undefined : titleKeyForMatching(rule.titlePrefix);
    return suffix.length > 0 && titleKey.endsWith(suffix) &&
      (prefix === undefined || (prefix.length > 0 && titleKey.startsWith(prefix)));
  });
  if (suffixRule) return { title, briefingHints: [suffixRule.hint] };

  const person = rules.personOnlyTitles.find(name => equalTitleKeys(titleKey, name));
  if (person) return { title: `${person.trim()}さんとの予定` };

  return { title };
}

function isExcluded(title: string, rules: ScheduleRules): boolean {
  const titleKey = titleKeyForMatching(title);
  return rules.excludedTitles.some(value => equalTitleKeys(titleKey, value)) || rules.excludedTitleFragments.some(fragment => {
    const key = titleKeyForMatching(fragment);
    return key.length > 0 && titleKey.includes(key);
  });
}

function equalTitleKeys(key: string, value: string): boolean {
  const other = titleKeyForMatching(value);
  return other.length > 0 && key === other;
}

// 照合用のキーだけを作る。単語間の空白は残し、カレンダーの原文は変えない。
function titleKeyForMatching(title: string): string {
  return title.normalize("NFKC").toLowerCase()
    .replace(/[\uFE0E\uFE0F]/gu, "")
    .trim().replace(/\s+/gu, " ")
    .replace(/(\p{Extended_Pictographic}) +/gu, "$1");
}
