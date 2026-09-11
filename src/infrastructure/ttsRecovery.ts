const COMMON_TRANSCRIPTION_VARIANTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/良い/g, "よい"],
  [/1日/g, "一日"],
  [/行ってらっしゃい/g, "いってらっしゃい"],
];

export type TtsTranscriptAssessment = {
  closingSentence: string;
  precedingSentence?: string;
  closingScore: number;
  precedingScore: number;
  hasClosing: boolean;
  canAppendFallbackClosing: boolean;
};

export type SeamAdjustment = {
  padMs: number;
  trimMs: number;
};

export function extractFinalSentences(text: string): { closing: string; preceding?: string } {
  const sentences = text
    .trim()
    .match(/[^。！？!?]+[。！？!?]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];
  if (sentences.length === 0) return { closing: text.trim() };
  return {
    closing: sentences.at(-1)!,
    preceding: sentences.length >= 2 ? sentences.at(-2) : undefined,
  };
}

export function assessTtsTranscript(expectedText: string, transcript: string): TtsTranscriptAssessment {
  const { closing, preceding } = extractFinalSentences(expectedText);
  const closingScore = bestTextMatchScore(closing, transcript);
  const precedingScore = preceding ? bestTextMatchScore(preceding, transcript) : 1;
  return {
    closingSentence: closing,
    precedingSentence: preceding,
    closingScore,
    precedingScore,
    hasClosing: closingScore >= 0.72,
    canAppendFallbackClosing: closingScore < 0.35 && precedingScore >= 0.72,
  };
}

export function calculateSeamAdjustment(
  trailingSilenceMs: number,
  closingLeadingSilenceMs: number,
  targetPauseMs = 600,
): SeamAdjustment {
  const difference = Math.round(targetPauseMs - trailingSilenceMs - closingLeadingSilenceMs);
  return difference >= 0
    ? { padMs: difference, trimMs: 0 }
    : { padMs: 0, trimMs: -difference };
}

export function bestTextMatchScore(expected: string, actual: string): number {
  const target = normalizeSpeechText(expected);
  const source = normalizeSpeechText(actual);
  if (!target) return 1;
  if (!source) return 0;
  if (source.includes(target)) return 1;

  const minimumLength = Math.max(1, target.length - 6);
  const maximumLength = Math.min(source.length, target.length + 6);
  let best = 0;
  for (let length = minimumLength; length <= maximumLength; length += 1) {
    for (let start = 0; start + length <= source.length; start += 1) {
      const candidate = source.slice(start, start + length);
      const distance = levenshteinDistance(target, candidate);
      best = Math.max(best, 1 - distance / Math.max(target.length, candidate.length));
    }
  }
  return best;
}

function normalizeSpeechText(text: string): string {
  return COMMON_TRANSCRIPTION_VARIANTS.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    text.normalize("NFKC").replace(/[\s、。,.!?！？]/g, ""),
  );
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]!;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex]!;
      const substitution = diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      previous[rightIndex] = Math.min(previous[rightIndex - 1]! + 1, above + 1, substitution);
      diagonal = above;
    }
  }
  return previous[right.length]!;
}
