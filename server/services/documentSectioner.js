/**
 * Document Sectioner Interface
 * 
 * Splits incoming compliance documents into logical sections/paragraphs while
 * preserving global document character offsets (start, end).
 */

export function sectionDocument(fullText) {
  if (!fullText || typeof fullText !== 'string') {
    return [];
  }

  // Split on double newlines or single newlines with headings, preserving exact offsets
  const sections = [];
  const regex = /(?:[^\r\n]+(?:\r?\n(?![A-Z0-9\s-]{3,}:|\r?\n)[^\r\n]+)*)/g;
  let match;

  while ((match = regex.exec(fullText)) !== null) {
    const rawMatch = match[0];
    const trimmed = rawMatch.trim();

    if (trimmed.length > 0) {
      const leadingWhitespace = rawMatch.indexOf(trimmed);
      const start = match.index + leadingWhitespace;
      const end = start + trimmed.length;

      sections.push({
        sectionIndex: sections.length,
        text: trimmed,
        start,
        end,
        charLength: trimmed.length
      });
    }
  }

  // Fallback if regex split didn't find multiple paragraphs
  if (sections.length === 0 && fullText.trim().length > 0) {
    const trimmed = fullText.trim();
    const start = fullText.indexOf(trimmed);
    sections.push({
      sectionIndex: 0,
      text: trimmed,
      start,
      end: start + trimmed.length,
      charLength: trimmed.length
    });
  }

  return sections;
}
