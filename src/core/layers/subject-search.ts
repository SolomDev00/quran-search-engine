import { normalizeArabic, isArabic } from '../../utils/normalization';
import type {
  VerseInput,
  ScoredVerse,
  AdvancedSearchOptions,
  InvertedIndex,
  SubjectIndex,
} from '../../types';

/** Resolve a raw query string to matched Arabic words and subject keys. */
const resolveQuery = (
  rawQuery: string,
  subjectMap: Map<string, string[]>,
): {
  matchedArabicWords: Set<string>;
  matchedSubjects: string[];
  directArabicWords: Set<string>;
} => {
  const matchedArabicWords = new Set<string>();
  const matchedSubjects: string[] = [];
  // Arabic typed straight into the query, i.e. not resolved through a subject key.
  // These are not covered by subjectIndex, so the indexed path resolves them separately.
  const directArabicWords = new Set<string>();

  // Try the full query as a phrase key first — resolves multi-word aliases
  // like "eternal life", "judgment day", "blazing fire".
  const fullPhrase = rawQuery
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim();
  if (fullPhrase && subjectMap.has(fullPhrase)) {
    subjectMap.get(fullPhrase)?.forEach((w) => matchedArabicWords.add(w));
    matchedSubjects.push(fullPhrase);
  }

  for (const token of rawQuery.split(/\s+/)) {
    if (isArabic(token)) {
      const normalized = normalizeArabic(token);
      if (!normalized) continue;
      const subjectWords = subjectMap.get(normalized);
      if (subjectWords) {
        subjectWords.forEach((w) => matchedArabicWords.add(w));
        matchedSubjects.push(normalized);
      } else {
        matchedArabicWords.add(normalized);
        directArabicWords.add(normalized);
      }
      continue;
    }

    const cleanToken = token
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .trim();
    if (!cleanToken) continue;
    const subjectWords = subjectMap.get(cleanToken);
    if (subjectWords) {
      subjectWords.forEach((w) => matchedArabicWords.add(w));
      matchedSubjects.push(cleanToken);
    }
  }

  return { matchedArabicWords, matchedSubjects, directArabicWords };
};

/** Score a single verse against the matched Arabic words, respecting range filters. */
const scoreVerse = <TVerse extends VerseInput>(
  verse: TVerse,
  options: AdvancedSearchOptions,
  matchedArabicWords: Set<string>,
): ScoredVerse<TVerse> | null => {
  if (options.suraId && verse.sura_id !== options.suraId) return null;
  if (options.juzId && verse.juz_id !== options.juzId) return null;
  if (options.suraName && verse.sura_name !== options.suraName) return null;

  const normalizedVerse = normalizeArabic(verse.standard);
  const matchedKeywords = Array.from(matchedArabicWords).filter((w) => normalizedVerse.includes(w));

  if (matchedKeywords.length === 0) return null;

  return {
    ...verse,
    matchType: 'subject',
    matchScore: matchedKeywords.length * 4,
    matchedTokens: matchedKeywords,
  };
};

/**
 * Collect the GIDs of every verse containing one of `words` as a substring.
 *
 * `wordIndex` keys are the normalized, whitespace-delimited tokens of each verse, so a
 * whitespace-free needle occurs in a verse if and only if it occurs inside one of its
 * tokens. Testing `token.includes(word)` therefore selects exactly the same verses as the
 * scan path's `normalizedVerse.includes(word)` — that is what keeps prefixed forms such as
 * `وامطرنا` matching the bare word `مطر` on both paths.
 */
const collectSubstringGids = (
  words: Set<string>,
  wordIndex: Map<string, Set<number>>,
): Set<number> => {
  const gids = new Set<number>();
  for (const [token, tokenGids] of wordIndex) {
    for (const word of words) {
      if (token.includes(word)) {
        tokenGids.forEach((gid) => gids.add(gid));
        break;
      }
    }
  }
  return gids;
};

/** Collect scored verse candidates via the pre-built subjectIndex (fast path). */
const collectFromIndex = <TVerse extends VerseInput>(
  matchedSubjects: string[],
  matchedArabicWords: Set<string>,
  directArabicWords: Set<string>,
  quranData: Map<number, TVerse>,
  options: AdvancedSearchOptions,
  subjectIndex: SubjectIndex,
  wordIndex: Map<string, Set<number>>,
): ScoredVerse<TVerse>[] => {
  const matchedGids = new Set<number>();

  // subjectIndex is itself built with substring matching, so subject keys are already
  // in parity with the scan path.
  for (const subject of matchedSubjects) {
    subjectIndex.get(subject)?.forEach((gid) => matchedGids.add(gid));
  }
  // Arabic entered directly has no subjectIndex entry; resolve it through wordIndex.
  if (directArabicWords.size > 0) {
    collectSubstringGids(directArabicWords, wordIndex).forEach((gid) => matchedGids.add(gid));
  }

  const results: ScoredVerse<TVerse>[] = [];
  for (const gid of matchedGids) {
    const verse = quranData.get(gid);
    if (!verse) continue;
    const scored = scoreVerse(verse, options, matchedArabicWords);
    if (scored) results.push(scored);
  }
  return results;
};

export const performSubjectSearch = <TVerse extends VerseInput>(
  query: string,
  quranData: Map<number, TVerse>,
  options: AdvancedSearchOptions,
  subjectMap?: Map<string, string[]>,
  originalQuery?: string,
  invertedIndex?: InvertedIndex,
): ScoredVerse<TVerse>[] => {
  if (!options.subject || !subjectMap) return [];

  const { matchedArabicWords, matchedSubjects, directArabicWords } = resolveQuery(
    (originalQuery ?? query).trim(),
    subjectMap,
  );

  if (matchedArabicWords.size === 0) return [];

  const subjectIndex = invertedIndex?.subjectIndex;

  if (invertedIndex && subjectIndex) {
    return collectFromIndex(
      matchedSubjects,
      matchedArabicWords,
      directArabicWords,
      quranData,
      options,
      subjectIndex,
      invertedIndex.wordIndex,
    );
  }

  // Slow path: scan all verses
  const results: ScoredVerse<TVerse>[] = [];
  for (const verse of quranData.values()) {
    const scored = scoreVerse(verse, options, matchedArabicWords);
    if (scored) results.push(scored);
  }
  return results;
};
