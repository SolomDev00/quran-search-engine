# Subject & Multi-Word Search

This guide covers two complementary features introduced in v0.4.x:

- **Subject search** — thematic search via curated Arabic lemma groups (e.g. `"climate"` → weather-related verses)
- **Multi-word search** — independent multi-term search with score/coverage/frequency ranking (e.g. `["muhammad", "yunus", "ibrahim"]`)

---

## Subject Search

### How subjects differ from semantic synonyms

The **semantic map** (`loadSemanticData`) links individual words to their linguistic synonyms and related concepts — it is essentially a per-word thesaurus.  
The **subject map** (`loadSubjectData`) organises Arabic lemmas into *thematic groups* keyed by an English concept word. A single subject key can cover dozens of lemmas that belong to the same Islamic topic even if they share no morphological root.

| | Semantic map | Subject map |
|---|---|---|
| Key | Arabic word or English word | English concept (topic name) |
| Value | Synonymous Arabic words | All Arabic lemmas relevant to the theme |
| Match logic | Word-level synonym expansion | Substring search across lemmas in the theme group |
| Best for | Lexical synonyms | Thematic / conceptual search |

**Practical difference** — searching `"climate"` with `{ semantic: true }` typically returns zero results because the semantic map has no entry for the English word *climate*. With `{ subject: true }` the engine looks up the *weather* subject group and returns every verse that contains any of مطر، رياح، عاصفة، سحاب، برق، رعد …

```ts
// ❌ Zero hits — semantic map has no 'climate' entry
search('climate', context, { semantic: true });

// ✅ Weather-themed verses — subject map covers it
search('climate', { ...context, subjectMap }, { subject: true });
// → verses containing مطر، رياح، عاصفة، سحاب، برق، رعد …
```

### Loading subject data

```ts
import {
  loadSubjectData,
  buildInvertedIndex,
  search,
} from 'quran-search-engine';

// Load alongside other data
const [quranData, morphologyMap, wordMap, semanticMap, subjectMap] = await Promise.all([
  loadQuranData(),
  loadMorphology(),
  loadWordMap(),
  loadSemanticData(),
  loadSubjectData(),           // v0.4.0+
]);

// Pass subjectMap to buildInvertedIndex so it pre-builds the subjectIndex
const invertedIndex = buildInvertedIndex(morphologyMap, quranData, semanticMap, subjectMap);

// Pass both to the search context
const context = { quranData, morphologyMap, wordMap, semanticMap, subjectMap, invertedIndex };
```

### Performing a subject search

```ts
const response = search(
  'climate',
  context,
  { subject: true },
  { page: 1, limit: 20 },
);

response.results.forEach((v) => {
  console.log(v.sura_id, v.aya_id, v.matchType); // matchType === 'subject'
});
```

Any of the English aliases or the subject name itself triggers the group:

```ts
search('rain', context, { subject: true });    // same weather group
search('storm', context, { subject: true });   // same weather group
search('worship', context, { subject: true }); // worship group → صلاة، زكاة، حج …
```

### Extending the subject map

The seed file `src/data/subjects.json` ships 20 Islamic themes. Each entry follows this schema:

```json
{
  "subject": "weather",
  "english": ["weather", "climate", "atmosphere", "rain", "storm"],
  "arabic": ["مطر", "رياح", "عاصفة", "سحاب", "برق", "رعد"]
}
```

To add a new theme:

1. Copy any existing entry as a template.
2. Set `"subject"` to a unique snake_case name.
3. List English aliases in `"english"` (all lowercase, no punctuation).
4. List Arabic lemmas in `"arabic"` — use unvowelled base forms; the engine normalises them internally.
5. Save the file and reload the page (or restart the server) — `loadSubjectData()` re-imports the JSON on the next call.

**Contribution tip**: open a PR with your new theme. The more themes the file covers, the more useful the library becomes for everyone.

---

## Multi-Word Search

### The array overload

`search()` accepts either a single string *or* an array of strings. When an array is passed each term is searched independently through the full pipeline (exact → lemma → root → fuzzy → semantic), then the per-verse results are merged and re-ranked.

```ts
// Single term (existing usage — unchanged)
const single = search('الله', context, options, pagination);

// Multiple independent terms — new in v0.4.x
const multi = search(
  ['محمد', 'يونس', 'إبراهيم'],
  context,
  options,
  { page: 1, limit: 20, rankBy: 'coverage' },
);
```

The response type is `MultiTermResponse<TVerse>` which extends the standard response with per-verse aggregation fields:

```ts
multi.results[0].matchedTerms;    // e.g. ['محمد', 'إبراهيم']
multi.results[0].distinctTermCount; // 2
multi.results[0].totalFrequency;   // total match count across all terms
```

### Ranking modes

| `rankBy` | Description |
|---|---|
| `'score'` (default) | Highest total `matchScore` across all matched terms |
| `'coverage'` | Most distinct search terms found in the same verse |
| `'frequency'` | Most total term occurrences in the verse |

```ts
// Find verses mentioning the most prophets
search(
  ['محمد', 'يونس', 'إبراهيم', 'موسى', 'عيسى'],
  context,
  { lemma: true, root: true },
  { page: 1, limit: 10, rankBy: 'coverage' },
);
// → verses that mention the highest number of distinct prophets float to the top
```

```ts
// Find the verse with the highest raw term frequency (كثرة الذكر)
search(
  ['الله', 'رب'],
  context,
  { lemma: true, root: true },
  { page: 1, limit: 10, rankBy: 'frequency' },
);
```

### AI pipeline example

A common pattern is using an LLM to expand a conceptual query into a list of names or keywords, then passing the list directly to `search()`:

```ts
// Imagine an LLM returned this list for the prompt "prophets mentioned in the Quran"
const prophetNames = ['محمد', 'يونس', 'إبراهيم', 'موسى', 'عيسى', 'نوح', 'آدم'];

const response = search(
  prophetNames,
  context,
  { lemma: true, root: true },
  { page: 1, limit: 20, rankBy: 'coverage' },
);

// Each result shows which prophets appear in that verse
response.results.forEach((v) => {
  console.log(`${v.sura_id}:${v.aya_id} — ${v.matchedTerms.join(', ')}`);
});
```

---

## Combining both features

Subject search and multi-term search are independent options. You can combine them when the context includes `subjectMap`:

```ts
// Find verses relevant to both worship and knowledge
const response = search(
  ['worship', 'knowledge'],
  { ...context, subjectMap },
  { subject: true },
  { page: 1, limit: 20, rankBy: 'coverage' },
);
```

---

## See also

- [Search Syntax & Scoring](./search-syntax.md) — full option reference
- [Advanced Configuration](./configuration.md) — `AdvancedSearchOptions` type
- [Migration Guide](../migration-guide.md) — upgrading from v0.3.x to v0.4.x
