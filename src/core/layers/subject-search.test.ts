import { describe, it, expect } from 'vitest';
import { search } from '../search';
import { performSubjectSearch } from './subject-search';
import { buildInvertedIndex } from '../../utils/loader';
import type { QuranText, MorphologyAya, ScoredVerse } from '../../types';

const mockQuranData: QuranText[] = [
  {
    gid: 1,
    uthmani: 'وَأَنزَلْنَا مِنَ ٱلسَّمَآءِ مَآءً',
    standard: 'وانزلنا من السماء ماء',
    sura_id: 23,
    aya_id: 18,
    aya_id_display: '18',
    page_id: 342,
    juz_id: 18,
    standard_full: 'وَأَنزَلْنَا مِنَ السَّمَاءِ مَاءً',
    sura_name: 'المؤمنون',
    sura_name_en: 'The Believers',
    sura_name_romanization: 'Al-Muminun',
  },
  {
    gid: 2,
    uthmani: 'وَأَرْسَلْنَا ٱلرِّيَٰحَ لَوَٰقِحَ',
    standard: 'وارسلنا الرياح لواقح',
    sura_id: 15,
    aya_id: 22,
    aya_id_display: '22',
    page_id: 262,
    juz_id: 14,
    standard_full: 'وَأَرْسَلْنَا الرِّيَاحَ لَوَاقِحَ',
    sura_name: 'الحجر',
    sura_name_en: 'The Rocky Tract',
    sura_name_romanization: 'Al-Hijr',
  },
  {
    gid: 3,
    uthmani: 'وَلِلَّهِ مَا فِي ٱلسَّمَٰوَٰتِ وَمَا فِي ٱلْأَرْضِ',
    standard: 'ولله ما في السماوات وما في الارض',
    sura_id: 2,
    aya_id: 284,
    aya_id_display: '284',
    page_id: 48,
    juz_id: 3,
    standard_full: 'وَلِلَّهِ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ',
    sura_name: 'البقرة',
    sura_name_en: 'The Cow',
    sura_name_romanization: 'Al-Baqarah',
  },
];

const mockQuranDataMap = new Map(mockQuranData.map((v) => [v.gid, v]));
const mockMorphologyMap = new Map<number, MorphologyAya>();
const mockWordMap = new Map<string, { lemma?: string; root?: string }>();

// Subject map: "weather" → Arabic weather-related words
const mockSubjectMap = new Map<string, string[]>([
  ['weather', ['ماء', 'رياح', 'سحاب', 'مطر', 'برق', 'رعد']],
  ['climate', ['ماء', 'رياح', 'سحاب', 'مطر', 'برق', 'رعد']],
  ['rain', ['ماء', 'مطر', 'غيث']],
  ['wind', ['رياح', 'ريح']],
]);

describe('Subject Search', () => {
  it('should find verses by English subject keyword (climate)', () => {
    const result = search(
      'climate',
      {
        quranData: mockQuranDataMap,
        morphologyMap: mockMorphologyMap,
        wordMap: mockWordMap,
        subjectMap: mockSubjectMap,
      },
      { lemma: false, root: false, subject: true },
    );

    const gids = result.results.map((r: ScoredVerse) => r.gid);
    // gid 1 has ماء, gid 2 has رياح — both are in the weather subject
    expect(gids).toContain(1);
    expect(gids).toContain(2);
    expect(result.counts.subject).toBeGreaterThan(0);
  });

  it('should find verses by English subject keyword (weather)', () => {
    const result = search(
      'weather',
      {
        quranData: mockQuranDataMap,
        morphologyMap: mockMorphologyMap,
        wordMap: mockWordMap,
        subjectMap: mockSubjectMap,
      },
      { lemma: false, root: false, subject: true },
    );

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.counts.subject).toBeGreaterThan(0);
  });

  it('should return empty when subject option is false', () => {
    const result = search(
      'climate',
      {
        quranData: mockQuranDataMap,
        morphologyMap: mockMorphologyMap,
        wordMap: mockWordMap,
        subjectMap: mockSubjectMap,
      },
      { lemma: false, root: false, subject: false },
    );

    const subjectResults = result.results.filter((r) => r.matchType === 'subject');
    expect(subjectResults).toHaveLength(0);
  });

  it('should return empty when no subjectMap is provided', () => {
    const result = search(
      'climate',
      {
        quranData: mockQuranDataMap,
        morphologyMap: mockMorphologyMap,
        wordMap: mockWordMap,
      },
      { lemma: false, root: false, subject: true },
    );

    const subjectResults = result.results.filter((r) => r.matchType === 'subject');
    expect(subjectResults).toHaveLength(0);
  });

  it('should return subject matchType on matched verses', () => {
    const result = search(
      'rain',
      {
        quranData: mockQuranDataMap,
        morphologyMap: mockMorphologyMap,
        wordMap: mockWordMap,
        subjectMap: mockSubjectMap,
      },
      { lemma: false, root: false, subject: true },
    );

    const subjectResults = result.results.filter((r) => r.matchType === 'subject');
    expect(subjectResults.length).toBeGreaterThan(0);
    subjectResults.forEach((r) => {
      expect(r.matchedTokens.length).toBeGreaterThan(0);
      expect(r.matchScore).toBeGreaterThan(0);
    });
  });

  it('should not find unrelated verse (gid 3) when searching for weather', () => {
    const result = search(
      'weather',
      {
        quranData: mockQuranDataMap,
        morphologyMap: mockMorphologyMap,
        wordMap: mockWordMap,
        subjectMap: mockSubjectMap,
      },
      { lemma: false, root: false, subject: true },
    );

    const gids = result.results.map((r) => r.gid);
    // gid 3 only has سماوات/ارض — not in the weather subject map
    expect(gids).not.toContain(3);
  });
});

describe('Subject Search — indexed/scan parity', () => {
  // gid 4 carries the prefixed form وامطرنا, which contains the bare subject word مطر
  // but is a different whitespace-delimited token. It is the case where an exact
  // wordIndex lookup and a substring scan used to disagree.
  const parityVerse: QuranText = {
    gid: 4,
    uthmani: 'وَأَمْطَرْنَا عَلَيْهِم مَّطَرًا',
    standard: 'وامطرنا عليهم مطرا',
    sura_id: 7,
    aya_id: 84,
    aya_id_display: '84',
    page_id: 161,
    juz_id: 8,
    standard_full: 'وَأَمْطَرْنَا عَلَيْهِمْ مَطَرًا',
    sura_name: 'الأعراف',
    sura_name_en: 'The Heights',
    sura_name_romanization: 'Al-Araf',
  };

  const parityData = new Map([...mockQuranData, parityVerse].map((v) => [v.gid, v]));
  const invertedIndex = buildInvertedIndex(
    mockMorphologyMap,
    parityData,
    undefined,
    mockSubjectMap,
  );

  const gidsFor = (query: string, withIndex: boolean): number[] =>
    search(
      query,
      {
        quranData: parityData,
        morphologyMap: mockMorphologyMap,
        wordMap: mockWordMap,
        subjectMap: mockSubjectMap,
        ...(withIndex ? { invertedIndex } : {}),
      },
      { lemma: false, root: false, subject: true },
    )
      .results.filter((r: ScoredVerse) => r.matchType === 'subject')
      .map((r: ScoredVerse) => r.gid)
      .sort((a, b) => a - b);

  it.each(['climate', 'weather', 'rain', 'wind'])(
    'returns identical results with and without invertedIndex for "%s"',
    (query) => {
      expect(gidsFor(query, true)).toEqual(gidsFor(query, false));
    },
  );

  // Direct Arabic is exercised at the layer boundary: the full pipeline hands such a
  // query to the exact layer first, so the verse never reaches the result set tagged
  // as a subject match.
  const layerGids = (query: string, withIndex: boolean): number[] =>
    performSubjectSearch(
      query,
      parityData,
      { lemma: false, root: false, subject: true },
      mockSubjectMap,
      query,
      withIndex ? invertedIndex : undefined,
    )
      .map((r) => r.gid)
      .sort((a, b) => a - b);

  it('matches the prefixed form وامطرنا for the bare Arabic word مطر on both paths', () => {
    expect(layerGids('مطر', false)).toContain(4);
    expect(layerGids('مطر', true)).toContain(4);
    expect(layerGids('مطر', true)).toEqual(layerGids('مطر', false));
  });

  it.each(['climate', 'weather', 'rain', 'wind', 'مطر', 'رياح', 'ماء'])(
    'layer results are identical with and without invertedIndex for "%s"',
    (query) => {
      expect(layerGids(query, true)).toEqual(layerGids(query, false));
    },
  );

  it('resolves a subject whose words only appear in prefixed form on both paths', () => {
    expect(gidsFor('rain', false)).toContain(4);
    expect(gidsFor('rain', true)).toContain(4);
  });
});
