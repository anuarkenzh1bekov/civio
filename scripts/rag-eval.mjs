import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedTexts } from '../src/lib/rag/embeddings.mjs';
import { hybridSearch, selectStates } from '../src/lib/rag/core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CASES = [
  { question: 'How long can a new Texas resident drive using an out of state license?', expected: 'tx-licenses-521.029' },
  { question: 'After moving to Texas, how long can I keep driving on my old license?', expected: 'tx-licenses-521.029' },
  { question: 'What must a new Texas resident submit with a driver license application?', expected: 'tx-licenses-521.144' },
  { question: 'How many days do I have to register my car after moving to Texas?', expected: 'tx-registration-502.040' },
  { question: 'Why do I need to get a new driver license after moving to California?', expected: 'ca-dmv-driver-license' },
  { question: 'Do I pay California tax on income earned before moving there?', expected: 'ca-residency-tax' },
  { question: 'Can moving qualify me for health insurance outside open enrollment in California?', expected: 'ca-health-enrollment' },
  { question: 'How long does a California landlord have to return my security deposit?', expected: 'ca-civ-1950.5' },
  { question: 'When does a Texas landlord have to refund my security deposit?', expected: 'tx-pr-92.103' },
  { question: 'What are the minimum auto insurance limits in California?', expected: 'ca-veh-16056' },
  { question: 'When am I considered a California resident for income tax?', expected: ['ca-rtc-17014', 'ca-residency-tax'] },
  { question: 'Which vaccines does my child need to start school in California?', expected: 'ca-hsc-120335' },
  { question: 'How do I cook pasta carbonara?', expected: null },
  { question: 'Who won the football world cup?', expected: null },
  { question: 'What are the driver license requirements in New York?', expected: null },
];

export async function evaluate({ apiKey, progress = console.log } = {}) {
  const index = JSON.parse(await readFile(resolve(root, 'data/rag/index.json'), 'utf8'));
  const vectors = await embedTexts(CASES.map(c => c.question), 'RETRIEVAL_QUERY', { apiKey });
  const results = CASES.map((c, i) => {
    const hits = hybridSearch(index.chunks, c.question, vectors[i], { states: selectStates(c.question, c.profile ?? null) });
    const accepted = [c.expected].flat();
    const passed = c.expected ? hits.slice(0, 3).some(h => accepted.includes(h.chunk.documentId)) : hits.length === 0;
    return { question: c.question, passed, expected: c.expected,
      top: hits.slice(0, 3).map(h => ({ id: h.chunk.documentId, semantic: +h.semantic.toFixed(3), bm25: +h.normalizedLexical.toFixed(3), score: +h.score.toFixed(3) })) };
  });
  results.forEach(r => progress(JSON.stringify(r)));
  progress(`${results.filter(r => r.passed).length}/${results.length} retrieval cases passed (real Gemini query embeddings)`);
  return results;
}

if (typeof process !== 'undefined' && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(resolve(root, '.env.local')); } catch { /* supplied externally */ }
  const results = await evaluate();
  if (results.some(r => !r.passed)) process.exitCode = 1;
}
