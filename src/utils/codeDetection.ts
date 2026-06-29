// Conservative code detection (no GI dependencies, so it is unit-testable).
// Replaces highlight.js, which was bundled only to act as a classifier. Biased
// toward "not code" so prose is never mis-highlighted; uncertain text stays a
// plain note. Rendering of code items is done separately by prismjs in pango.ts.
const CODE_KEYWORDS =
  /\b(function|const|let|var|def|class|import|export|return|public|private|protected|static|void|int|float|double|bool|string|elif|switch|case|throw|async|await|require|package|namespace|struct|enum|interface|module|fn|impl|using)\b/;

export const looksLikeCode = (text: string): boolean => {
  const trimmed = text.trim();
  if (trimmed.length < 8) {
    return false;
  }
  let score = 0;
  if (/[{};]\s*(\n|$)/.test(trimmed)) score++; // lines ending in { } ;
  if (CODE_KEYWORDS.test(trimmed)) score++;
  if (/=>|->|::|===?|!==?|>=|<=|&&|\|\||\+\+|--|\)\s*\{/.test(trimmed)) score++; // operators
  if (/^\s*(#include|#define|#!|@\w+|from \w+ import|import \w|using )/m.test(trimmed)) score++; // headers
  if (/<\/?[a-zA-Z][^>]*>/.test(trimmed)) score++; // markup tags
  if (/\n/.test(trimmed) && /^[ \t]{2,}\S/m.test(trimmed)) score++; // indented multiline
  return score >= 2;
};
