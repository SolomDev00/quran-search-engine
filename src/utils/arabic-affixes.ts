/**
 * Arabic clitic handling for exact-stem lookups.
 *
 * Quranic orthography attaches a small, closed set of particles directly to the word
 * (`الرياح`, `وبالمطر`, `صلاتهم`). A bare dictionary form such as `ريح` therefore never
 * appears as a standalone token, which is why a naive `wordIndex.get(word)` misses it.
 *
 * Expanding the word into its attested clitic variants keeps lookups exact — unlike
 * substring matching, which conflates unrelated stems (`ماء` inside `سماء`, `اب` inside
 * `كتاب`).
 */

/** Proclitics: conjunctions, prepositions and the definite article, including combinations. */
const PREFIXES = [
  '',
  'ال',
  'و',
  'ف',
  'ب',
  'ك',
  'ل',
  'س',
  'وال',
  'فال',
  'بال',
  'كال',
  'لل',
  'ولل',
  'فلل',
  'وب',
  'فب',
  'ول',
  'فل',
  'وك',
  'فك',
  'وبال',
  'فبال',
  'وكال',
  'فكال',
  'ولل',
];

/** Enclitics: attached pronouns, plus the common plural/dual endings. */
const SUFFIXES = [
  '',
  'ه',
  'ها',
  'هم',
  'هن',
  'هما',
  'ك',
  'كم',
  'كن',
  'كما',
  'نا',
  'ي',
  'ني',
  'وا',
  'ون',
  'ين',
  'ان',
  'ات',
  'يه',
  // Accusative tanween, written as a bare alif once diacritics are stripped (مطرًا → مطرا).
  'ا',
];

/**
 * Expand a normalized Arabic word into the surface tokens it can appear as.
 *
 * A trailing ta marbuta is also expanded to its open form (`صلاة` → `صلات…`), which is how
 * the letter is written once a pronoun is attached.
 *
 * @param word A normalized Arabic word (see `normalizeArabic`).
 * @returns Every attested surface form of `word`, including the bare word itself.
 */
export const expandAffixVariants = (word: string): string[] => {
  if (!word) return [];

  // Words shorter than three letters are function words once clitics are stripped; expanding
  // them produces far more noise than signal, so they are matched verbatim only.
  if (word.length < 3) return [word];

  const stems = word.endsWith('ة') ? [word, `${word.slice(0, -1)}ت`] : [word];
  const variants = new Set<string>();

  for (const stem of stems) {
    for (const prefix of PREFIXES) {
      for (const suffix of SUFFIXES) {
        // A ta-marbuta stem only occurs bare; the open form is what takes a suffix.
        if (stem.endsWith('ة') && suffix) continue;
        variants.add(prefix + stem + suffix);
      }
    }
  }

  return Array.from(variants);
};
