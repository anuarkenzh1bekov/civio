export type Chunk = {
  id: string; documentId: string; title: string; state: string; kind: string;
  url: string; retrievedAt: string; retrievalMethod: string; startWord: number;
  text: string; embedding?: number[];
};
export type Document = Omit<Chunk, 'documentId' | 'startWord' | 'embedding'>;
export type Hit = { chunk: Chunk; semantic: number; lexical: number; normalizedLexical: number; score: number };
export const SEMANTIC_WEIGHT: number;
export const LEXICAL_WEIGHT: number;
export function tokenize(text: string): string[];
export function digest(value: string): string;
export function chunkDocuments(documents: Document[], size?: number, overlap?: number): Chunk[];
export function bm25(query: string, documents: string[]): number[];
export function normalizeVector(vector: number[], dimensions: number): number[];
export function cosine(a: number[], b: number[]): number;
export function selectStates(question: string, profile: { currentState?: string; destinationState?: string } | null): string[];
export function hybridSearch(chunks: Chunk[], question: string, queryVector: number[] | null, options?: {
  states?: string[]; limit?: number; minSemantic?: number;
}): Hit[];
