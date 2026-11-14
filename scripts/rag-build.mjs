import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { chunkDocuments, digest, normalizeVector } from '../src/lib/rag/core.mjs';
import { embedTexts, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '../src/lib/rag/embeddings.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function buildIndex({ apiKey, fetcher = fetch, progress = console.log } = {}) {
  const corpus = JSON.parse(await readFile(resolve(root, 'data/rag/corpus.json'), 'utf8'));
  const chunks = chunkDocuments(corpus.documents);
  let existing;
  try { existing = JSON.parse(await readFile(resolve(root, 'data/rag/index.json'), 'utf8')); } catch { /* first build */ }
  const reusable = existing?.model === EMBEDDING_MODEL && existing?.dimensions === EMBEDDING_DIMENSIONS
    ? new Map(existing.chunks.map(c => [c.id, c])) : new Map();
  const pending = [];
  for (const chunk of chunks) {
    const previous = reusable.get(chunk.id);
    if (previous?.text === chunk.text && previous.title === chunk.title) {
      try { chunk.embedding = normalizeVector(previous.embedding, EMBEDDING_DIMENSIONS); } catch { /* re-embed corrupt cache entry */ }
    }
    if (!chunk.embedding) pending.push(chunk);
  }
  for (let i = 0; i < pending.length; i += 16) {
    const batch = pending.slice(i, i + 16);
    const vectors = await embedTexts(batch.map(c => `${c.title}\n${c.text}`), 'RETRIEVAL_DOCUMENT', { apiKey, fetcher });
    batch.forEach((chunk, j) => { chunk.embedding = vectors[j]; });
    progress(`Embedded ${Math.min(i + 16, pending.length)}/${pending.length} new chunks`);
  }
  const index = { version: 1, model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS,
    corpusHash: digest(JSON.stringify(corpus.documents)), builtAt: new Date().toISOString(), chunks };
  const target = resolve(root, 'data/rag/index.json');
  await writeFile(`${target}.tmp`, JSON.stringify(index));
  await rename(`${target}.tmp`, target);
  progress(`Ready: ${corpus.documents.length} documents, ${chunks.length} chunks, semantic 70% / BM25 30%`);
  return index;
}

if (typeof process !== 'undefined' && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Node 22.12 does not support --env-file-if-exists on every install.
  try { process.loadEnvFile(resolve(root, '.env.local')); } catch { /* environment may supply the key */ }
  await buildIndex();
}

