// ─── Core (preserved) ──────────────────────────────────────────────────────
export interface BoundingBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  createdAt: number;
}

export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: Date;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface LiveConfig {
  model: string;
  systemInstruction: string;
}

// ─── Tooling (Phase 1) ────────────────────────────────────────────────────────
export type ToolType = 'cursor' | 'focus-box' | 'laser-pointer' | 'free-draw';

export interface LaserPoint {
  x: number;
  y: number;
  time: number;
}

export interface DrawStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  createdAt: number;
}

// ─── AI Visual Feedback (Phase 3) ─────────────────────────────────────────────
export type AIOverlayType = 'highlight' | 'pointer' | 'pulse' | 'callout' | 'circle' | 'arrow';

export interface AIOverlay {
  id: string;
  type: AIOverlayType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  label?: string;
  createdAt: number;
  duration: number; // ms — 0 means persistent until removed
  targetX?: number; // arrow tip X (screen pixels)
  targetY?: number; // arrow tip Y (screen pixels)
}

// ─── Suggestions (Phase 2) ─────────────────────────────────────────────────────
export interface Suggestion {
  id: string;
  text: string;
}

// ─── Visual Input Queue ───────────────────────────────────────────────────────
export type VisualSource = 'screen' | 'focus';

export interface LatestScreenshotFrame {
  base64: string;
  mimeType: 'image/jpeg';
  capturedAt: number;
}

export interface FocusQueueEntry {
  boxId: string;
  box: BoundingBox;
  base64: string;
  mimeType: 'image/png';
  updatedAt: number;
}

// ─── Mind Palace ──────────────────────────────────────────────────────────────
export type {
  MemoryRecord,
  SearchResult as MindPalaceSearchResult,
  MindPalaceStats,
  CaptureFrame,
  EmbeddingRecord,
} from './lib/mind-palace/types';

// ─── Agent Brain (Agentic Loop) ───────────────────────────────────────────────

export type AgentStatus = 'idle' | 'running' | 'cancelled' | 'complete' | 'error';

export interface AgentStep {
  stepIndex: number;
  /** 'tool_call' when the model invokes a tool, 'tool_result' for its output, 'answer' for the final response. */
  type: 'tool_call' | 'tool_result' | 'answer';
  content: string;
  toolName?: string;
  timestamp: number;
}

export interface AgentTask {
  id: string;
  userRequest: string;
  startedAt: number;
  status: AgentStatus;
  steps: AgentStep[];
  finalAnswer?: string;
  /** Web search results attached to the final answer, if any. */
  searchResults?: Array<{ title: string; url: string; snippet: string }>;
}

// ─── Session Memory (Phase 4) ──────────────────────────────────────────────────
export type ArtifactSnapshot =
  | { type: 'focus-box'; box: BoundingBox; regionBase64?: string }
  | { type: 'draw-stroke'; stroke: DrawStroke }
  | { type: 'laser-trail'; points: LaserPoint[] };

export interface InteractionTurn {
  id: string;
  userText: string;
  modelText: string;
  artifacts: ArtifactSnapshot[];
  timestamp: number;
}
