export const EMBEDDING_MODEL: string;
export const EMBEDDING_DIMENSIONS: number;
export function embedTexts(texts: string[], taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY', options?: {
  apiKey?: string; signal?: AbortSignal; fetcher?: typeof fetch;
}): Promise<number[][]>;
