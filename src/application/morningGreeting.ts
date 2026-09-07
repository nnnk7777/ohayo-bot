const morningGreeting = "おはようございます。";

export function ensureMorningGreeting(text: string): string {
  const briefing = text.trim();
  if (!briefing || briefing.startsWith(morningGreeting)) return briefing;
  return `${morningGreeting}\n\n${briefing}`;
}
