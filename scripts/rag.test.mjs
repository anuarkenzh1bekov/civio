import test from 'node:test';
import assert from 'node:assert/strict';
import { bm25, chunkDocuments, cosine, hybridSearch, selectStates, tokenize } from '../src/lib/rag/core.mjs';
import { embedTexts } from '../src/lib/rag/embeddings.mjs';
import { extractDocuments, htmlText } from './rag-ingest.mjs';

const chunk = (id, text, embedding, state = 'CA') => ({ id, documentId: id, title: '', text, embedding, state });
test('BM25 uses frequency, document frequency and length, not plain overlap', () => {
  const scores = bm25('license', ['license license', 'license ' + 'irrelevant '.repeat(40), 'health insurance']);
  assert(scores[0] > scores[1]); assert.equal(scores[2], 0);
  const single = bm25('license', ['license'])[0];
  assert(Math.abs(single - Math.log(1 + 0.5 / 1.5)) < 1e-10);
});
test('70/30 fusion can rank a semantic match over a lexical match', () => {
  const chunks = [chunk('semantic', 'residency', [1, 0]), chunk('lexical', 'license', [0.6, 0.8])];
  const hits = hybridSearch(chunks, 'license', [1, 0]);
  assert.equal(hits[0].chunk.id, 'lexical'); // .7*.6 + .3*1 = .72 versus .7
  assert(Math.abs(hits[0].score - 0.72) < 1e-12);
  const stronger = hybridSearch([chunks[0], chunk('lexical', 'license', [0.5, Math.sqrt(0.75)])], 'license', [1, 0]);
  assert.equal(stronger[0].chunk.id, 'semantic');
});
test('unrelated lexical questions do not inherit profile relevance', () => {
  assert.deepEqual(hybridSearch([chunk('car', 'driver license', [1, 0])], 'cook pasta', null), []);
});
test('semantic threshold rejects unrelated queries even if a common word matches', () => {
  assert.deepEqual(hybridSearch([chunk('car', 'license', [0, 1])], 'license', [1, 0]), []);
});
test('explicit jurisdiction overrides profile, including Russian', () => {
  assert.deepEqual(selectStates('Права в Техасе', { destinationState: 'CA' }), ['TX']);
  const hits = hybridSearch([chunk('ca', 'license', [1, 0]), chunk('tx', 'license', [1, 0], 'TX')], 'license', [1, 0], { states: ['TX'] });
  assert.deepEqual(hits.map(h => h.chunk.id), ['tx']);
  assert.deepEqual(selectStates('license', { destinationState: 'NY' }), ['NY']);
  assert.deepEqual(selectStates('driver license in New York', { destinationState: 'CA' }), ['NY']);
});
test('Unicode tokenization retains Russian and statute numbers', () => {
  assert(tokenize('права 521.029').includes('права'));
  assert(tokenize('права 521.029').includes('521.029'));
});
test('chunking has stable IDs, bounded size, overlap and full coverage', () => {
  const doc = { id: 'd', text: Array.from({length: 700}, (_, i) => 'w'+i).join(' ') };
  const chunks = chunkDocuments([doc]);
  assert.equal(chunks.length, 3); assert(chunks.every(c => c.text.split(' ').length <= 280));
  assert(chunks[1].text.startsWith('w235 ')); assert(chunks.at(-1).text.endsWith('w699'));
  assert.equal(chunks[0].id, chunkDocuments([doc])[0].id);
});
test('statutes are cut on subsection boundaries, not mid-sentence', () => {
  const sub = (letter, n) => [`(${letter})`, ...Array.from({ length: n }, (_, i) => `${letter}${i}`)].join(' ');
  const text = ['Sec. 1.', sub('a', 100), sub('b', 100), 'see subdivision (a) here', sub('c', 150), sub('d', 400)].join(' ');
  const chunks = chunkDocuments([{ id: 's', kind: 'statute', text }]);
  assert(chunks[0].text.startsWith('Sec. 1. (a)') && chunks[0].text.includes('(b) b0') && chunks[0].text.includes('subdivision (a) here'));
  assert(chunks[1].text.startsWith('(c) c0') && chunks[1].text.endsWith('c149'));
  assert(chunks.slice(2).every(c => c.text.split(' ').length <= 280));
  const words = new Set(chunks.flatMap(c => c.text.split(' ')));
  assert(text.split(' ').every(w => words.has(w)));
});
test('cosine rejects dimension mismatch', () => {
  assert.throws(() => cosine([1, 0], [1])); assert.equal(cosine([2, 0], [5, 0]), 1);
});
test('ingestion strips scripts and extracts exact statute boundaries', () => {
  assert.equal(htmlText('<p>A &amp; B</p><script>bad</script>'), 'A & B');
  const a = 'First section '.repeat(20), b = 'Second section '.repeat(20);
  const docs = extractDocuments({ id: 'tx', title: 'Law', sections: ['521.029'], url: 'https://example.gov' }, `<a name="521.029"></a><p>${a}</p><a name="521.030"></a><p>${b}</p>`);
  assert(docs[0].text.includes('First')); assert(!docs[0].text.includes('Second'));
  assert.throws(() => extractDocuments({ id: 'x', sections: ['521.029'] }, 'Access denied'));
});
test('embedding requests use retrieval task, fixed dimensions, and validate output', async () => {
  let sent;
  const fetcher = async (_, options) => { sent = JSON.parse(options.body); return Response.json({ embeddings: [{ values: Array.from({length:768}, (_, i) => i === 0 ? 2 : 0) }] }); };
  const vectors = await embedTexts(['hello'], 'RETRIEVAL_QUERY', { apiKey: 'test-only', fetcher });
  assert.equal(sent.requests[0].taskType, 'RETRIEVAL_QUERY');
  assert.equal(sent.requests[0].outputDimensionality, 768); assert.equal(vectors[0][0], 1);
  await assert.rejects(embedTexts(['hello'], 'RETRIEVAL_DOCUMENT', { apiKey: 'test-only', fetcher: async () => Response.json({ embeddings: [{ values: [1] }] }) }));
});
