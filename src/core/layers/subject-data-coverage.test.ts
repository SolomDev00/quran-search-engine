import { describe, it, expect } from 'vitest';
import { loadQuranData, loadMorphology, loadWordMap } from '../../utils/loader';
import { normalizeArabic } from '../../utils/normalization';
import { collectSubjectHits } from './subject-search';
import subjectsRaw from '../../data/subjects.json';

type SubjectConcept = { subject: string; english: string[]; arabic: string[] };

/**
 * Guards src/data/subjects.json against dead entries: an arabic[] word that matches zero
 * verses silently inflates the map and the subjectIndex for no benefit (see issue #120).
 * Each word is normalized exactly like `buildSubjectMap` does before being resolved against
 * the real Quran data, root, and lemma maps — the same path `loadSubjectData()` exercises.
 */
describe('subjects.json data quality', () => {
  it('every arabic[] entry matches at least one verse', async () => {
    const [quranData, morphologyMap, wordMap] = await Promise.all([
      loadQuranData(),
      loadMorphology(),
      loadWordMap(),
    ]);

    const subjects = subjectsRaw as SubjectConcept[];
    const dead: string[] = [];

    for (const { subject, arabic } of subjects) {
      for (const rawWord of arabic) {
        const word = normalizeArabic(rawWord);
        const hits = collectSubjectHits(new Set([word]), quranData, wordMap, morphologyMap);
        if (hits.size === 0) dead.push(`${subject}/${rawWord}`);
      }
    }

    expect(dead, `dead subject entries (0 verse matches): ${dead.join(', ')}`).toEqual([]);
  });
});
