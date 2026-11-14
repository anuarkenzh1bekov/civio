import { createHash } from 'node:crypto';

export const SEMANTIC_WEIGHT = 0.7;
export const LEXICAL_WEIGHT = 0.3;
const STOP = new Set('a an the and or to of in on for is are be i my me you your do does how what when why with from can must мне я как что где когда зачем нужно ли в на из и или'.split(' '));
// Small, deterministic lexical normalization; semantic matching still uses original text.
const LEXEMES = new Map([
  ['car', 'vehicle'], ['cars', 'vehicle'], ['vehicles', 'vehicle'], ['automobile', 'vehicle'],
  ['register', 'registration'], ['registered', 'registration'], ['registering', 'registration'],
  ['licence', 'license'], ['licenses', 'license'], ['licensing', 'license'], ['dl', 'license'],
  ['residents', 'resident'], ['residency', 'resident'], ['moving', 'move'], ['moved', 'move'],
  ['taxes', 'tax'], ['documents', 'document'],
]);

export function tokenize(text) {
  return (text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+(?:[.'-][\p{L}\p{N}]+)*/gu) ?? [])
    .filter(word => !STOP.has(word)).map(word => LEXEMES.get(word) ?? word);
}

export function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** Bounded overlapping windows; original wording and offsets remain auditable. */
/** Word ranges [start, end) of a statute's top-level subsections: "(a)", "(b)", ... */
function subsectionRanges(words) {
  const starts = [0];
  let expected = 'a';
  words.forEach((word, i) => {
    // Only the next letter in sequence counts, so "subdivision (a)" in a later
    // subsection does not start a new one.
    if (i > 0 && word === `(${expected})`) {
      starts.push(i);
      expected = String.fromCharCode(expected.charCodeAt(0) + 1);
    } else if (i === 0 && word === '(a)') expected = 'b';
  });
  return starts.map((start, i) => [start, starts[i + 1] ?? words.length]);
}

/** Window starts for the fixed-size fallback. */
function windows(from, to, size, overlap) {
  const ranges = [];
  for (let start = from; start < to; start += size - overlap) {
    ranges.push([start, Math.min(start + size, to)]);
    if (start + size >= to) break;
  }
  return ranges;
}

/**
 * Statutes are cut on subsection boundaries, packing whole subsections up to
 * `size` words, so a rule and its deadline stay in one chunk. A subsection
 * longer than `size`, and every other kind of document, uses overlapping windows.
 */
function chunkRanges(doc, words, size, overlap) {
  if (doc.kind !== 'statute') return windows(0, words.length, size, overlap);
  const ranges = [];
  let current = null;
  for (const [start, end] of subsectionRanges(words)) {
    if (end - start > size) {
      if (current) ranges.push(current);
      current = null;
      ranges.push(...windows(start, end, size, overlap));
    } else if (current && end - current[0] <= size) {
      current = [current[0], end];
    } else {
      if (current) ranges.push(current);
      current = [start, end];
    }
  }
  if (current) ranges.push(current);
  return ranges;
}

export function chunkDocuments(documents, size = 280, overlap = 45) {
  if (size <= overlap || overlap < 0) throw new Error('Invalid chunk window');
  return documents.flatMap(doc => {
    const words = doc.text.trim().split(/\s+/u);
    return chunkRanges(doc, words, size, overlap).map(([start, end]) => {
      const text = words.slice(start, end).join(' ');
      return { id: `${doc.id}:${start}:${digest(text).slice(0, 12)}`, documentId: doc.id,
        title: doc.title, state: doc.state, kind: doc.kind, url: doc.url,
        retrievedAt: doc.retrievedAt, retrievalMethod: doc.retrievalMethod,
        startWord: start, text };
    });
  });
}

/** Okapi BM25 with document length normalization, k1=1.5, b=0.75. */
export function bm25(query, documents) {
  const terms = [...new Set(tokenize(query))];
  const docs = documents.map(tokenize);
  const average = docs.reduce((sum, d) => sum + d.length, 0) / (docs.length || 1) || 1;
  const frequencies = docs.map(d => {
    const counts = new Map();
    for (const term of d) counts.set(term, (counts.get(term) ?? 0) + 1);
    return counts;
  });
  const idf = new Map(terms.map(term => {
    const df = frequencies.filter(counts => counts.has(term)).length;
    return [term, Math.log(1 + (docs.length - df + 0.5) / (df + 0.5))];
  }));
  return docs.map((d, i) => terms.reduce((sum, term) => {
    const tf = frequencies[i].get(term) ?? 0;
    return sum + idf.get(term) * (tf * 2.5) / (tf + 1.5 * (0.25 + 0.75 * d.length / average));
  }, 0));
}

export function normalizeVector(vector, dimensions) {
  if (!Array.isArray(vector) || vector.length !== dimensions || !vector.every(Number.isFinite)) {
    throw new Error('Invalid embedding dimensions or values');
  }
  const norm = Math.hypot(...vector);
  if (!norm) throw new Error('Zero embedding');
  return vector.map(x => x / norm);
}

export function cosine(a, b) {
  if (a.length !== b.length) throw new Error('Embedding dimension mismatch');
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb))) : 0;
}

/** Explicit state in question wins; otherwise restrict to the shared move's states. */
export function selectStates(question, profile) {
  const explicit = [];
  if (/\bcalifornia\b|\bCA\b|калифорни/iu.test(question)) explicit.push('CA');
  if (/\btexas\b|\bTX\b|техас/iu.test(question)) explicit.push('TX');
  // Unsupported jurisdictions must not silently retrieve California evidence.
  const otherStates = 'AL:Alabama;AK:Alaska;AZ:Arizona;AR:Arkansas;CO:Colorado;CT:Connecticut;DE:Delaware;DC:District of Columbia;FL:Florida;GA:Georgia;HI:Hawaii;ID:Idaho;IL:Illinois;IN:Indiana;IA:Iowa;KS:Kansas;KY:Kentucky;LA:Louisiana;ME:Maine;MD:Maryland;MA:Massachusetts;MI:Michigan;MN:Minnesota;MS:Mississippi;MO:Missouri;MT:Montana;NE:Nebraska;NV:Nevada;NH:New Hampshire;NJ:New Jersey;NM:New Mexico;NY:New York;NC:North Carolina;ND:North Dakota;OH:Ohio;OK:Oklahoma;OR:Oregon;PA:Pennsylvania;RI:Rhode Island;SC:South Carolina;SD:South Dakota;TN:Tennessee;UT:Utah;VT:Vermont;VA:Virginia;WA:Washington;WV:West Virginia;WI:Wisconsin;WY:Wyoming';
  for (const entry of otherStates.split(';')) {
    const [code, name] = entry.split(':');
    if (new RegExp(`\\b${name}\\b`, 'i').test(question) || new RegExp(`(?:in|to|from|state of)\\s+${code}\\b`).test(question)) explicit.push(code);
  }
  if (/нью[ -]йорк/iu.test(question)) explicit.push('NY');
  if (explicit.length) return [...new Set(explicit)];
  return [...new Set([profile?.currentState, profile?.destinationState].filter(Boolean))];
}

/** 70% cosine [0,1] + 30% BM25 / query max. No hidden profile score boosts. */
export function hybridSearch(chunks, question, queryVector, { states = [], limit = 6, minSemantic = 0.5 } = {}) {
  const candidates = chunks.filter(c => !states.length || c.state === 'US' || states.includes(c.state));
  const lexical = bm25(question, candidates.map(c => `${c.title}\n${c.text}`));
  const maxLexical = Math.max(0, ...lexical);
  const results = candidates.map((chunk, i) => {
    const semantic = queryVector && chunk.embedding ? Math.max(0, cosine(queryVector, chunk.embedding)) : 0;
    const normalizedLexical = maxLexical ? lexical[i] / maxLexical : 0;
    return { chunk, semantic, lexical: lexical[i], normalizedLexical,
      score: queryVector ? SEMANTIC_WEIGHT * semantic + LEXICAL_WEIGHT * normalizedLexical : normalizedLexical };
  }).filter(hit => queryVector ? hit.semantic >= minSemantic : hit.lexical > 0)
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
  // Prevent a long chapter from crowding every other source out of the prompt.
  const counts = new Map();
  return results.filter(hit => {
    const count = counts.get(hit.chunk.documentId) ?? 0;
    counts.set(hit.chunk.documentId, count + 1);
    return count < 3;
  }).slice(0, limit);
}
