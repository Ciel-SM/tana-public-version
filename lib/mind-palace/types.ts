// ─── Mind Palace Types ──────────────────────────────────────────────────────

export interface MemoryRecord {
  id: string;
  timestamp: number;
  embedding: Float32Array;
  transcription: string | null;
  screenshotPath: string | null;
  focusRegions: FocusRegionRef[];
  connectionState: string;
  embedText: string;
  embedModel: string;
  createdAt: number;
}

export interface FocusRegionRef {
  boxId: string;
  path: string;
}

export interface SearchResult {
  id: string;
  timestamp: number;
  transcription: string | null;
  screenshotPath: string | null;
  focusRegions: FocusRegionRef[];
  embedText: string;
  similarity: number;
}

export interface StorePayload {
  id: string;
  timestamp: number;
  embedding: number[];       // serialized Float32Array
  transcription: string | null;
  screenshotBase64: string | null;
  focusRegions: Array<{ boxId: string; base64: string }>;
  connectionState: string;
  embedText: string;
  embedModel: string;
}

export interface MindPalaceStats {
  totalMemories: number;
  storageBytesDb: number;
  storageBytesImages: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
}

export interface EmbeddingRecord {
  id: string;
  timestamp: number;
  embedding: Float32Array;
}

export interface MemoryMeta {
  id: string;
  timestamp: number;
  transcription: string | null;
  embedText: string;
  connectionState: string;
  hasScreenshot: boolean;
  hasFocusRegions: boolean;
}

export interface CaptureFrame {
  screenshotBase64: string | null;
  focusRegions: Array<{ boxId: string; base64: string }>;
  timestamp: number;
}
