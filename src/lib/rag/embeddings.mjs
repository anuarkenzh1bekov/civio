import { normalizeVector } from './core.mjs';

export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = 768;

/** Same model/dimensions for ingestion and queries; document/query task types differ. */
export async function embedTexts(texts, taskType, { apiKey = process.env.GOOGLE_API_KEY, signal, fetcher = fetch } = {}) {
  if (!apiKey) throw new Error('Embeddings require GOOGLE_API_KEY');
  if (!texts.length) return [];
  if (texts.length > 32) throw new Error('Embedding batch exceeds 32 texts');
  const timeout = AbortSignal.timeout(20000);
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`, {
    method: 'POST', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ requests: texts.map(text => ({ model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] }, taskType, outputDimensionality: EMBEDDING_DIMENSIONS })) }),
  });
  if (!response.ok) throw new Error(`Embedding API HTTP ${response.status}`);
  const result = await response.json();
  if (result.embeddings?.length !== texts.length) throw new Error('Incomplete embedding batch');
  return result.embeddings.map(embedding => normalizeVector(embedding.values, EMBEDDING_DIMENSIONS));
}
