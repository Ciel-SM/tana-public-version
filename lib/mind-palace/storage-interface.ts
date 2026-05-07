import { MemoryRecord, SearchResult, StorePayload, MindPalaceStats, EmbeddingRecord, MemoryMeta } from './types';

export interface MindPalaceStorage {
  initialize(): Promise<void>;
  storeMemory(payload: StorePayload): Promise<void>;
  getMemory(id: string): Promise<MemoryRecord | null>;
  searchByKeyword(query: string, limit: number): Promise<SearchResult[]>;
  getStats(): Promise<MindPalaceStats>;
  getRecent(limit: number): Promise<EmbeddingRecord[]>;
  getAllEmbeddings(): Promise<EmbeddingRecord[]>;
  getAllMetadata(): Promise<MemoryMeta[]>;
  deleteMemory(id: string): Promise<void>;
  close(): void;
}
