export const LONG_MESSAGE_CHAR_LIMIT = 520;
export const LONG_MESSAGE_LINE_LIMIT = 24;
export const LONG_MESSAGE_ESTIMATED_CHARS_PER_LINE = 22;

export function normalizeLongMessageText(value: unknown): string {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

export function estimateLongMessageLineCount(value: unknown): number {
  const text = normalizeLongMessageText(value);
  if (!text) return 0;

  return text.split('\n').reduce((sum, line) => {
    const length = line.trimEnd().length;
    return sum + Math.max(1, Math.ceil(length / LONG_MESSAGE_ESTIMATED_CHARS_PER_LINE));
  }, 0);
}

export function shouldCollapseLongMessage(value: unknown): boolean {
  const text = normalizeLongMessageText(value);
  if (!text) return false;
  if (text.length >= LONG_MESSAGE_CHAR_LIMIT) return true;
  return estimateLongMessageLineCount(text) >= LONG_MESSAGE_LINE_LIMIT;
}
