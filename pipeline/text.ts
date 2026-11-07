import { parse } from 'node-html-parser';

const MAX_DESCRIPTION_LENGTH = 1200;

/** Turn an HTML fragment into readable plain text, keeping paragraph breaks. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n');
  const text = parse(withBreaks).text;
  return text
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Decode HTML entities in a short string such as a title or location. */
export function cleanInlineText(text: string): string {
  return htmlToText(text).replace(/\s+/g, ' ').trim();
}

export function truncateDescription(text: string): string {
  if (text.length <= MAX_DESCRIPTION_LENGTH) return text;
  const cut = text.slice(0, MAX_DESCRIPTION_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** Empty or whitespace-only strings become null. */
export function nonEmpty(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
}
