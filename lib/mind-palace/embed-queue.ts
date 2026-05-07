// Async embed queue with backpressure and 429 handling

import type { GoogleGenAI } from '@google/genai';
import { embedMultimodal, EMBED_MODEL } from './embed';
import type { CaptureFrame, StorePayload } from './types';
import { getCredentialErrorMessage, isCredentialError } from '../google-api-errors';

const MAX_PENDING = 30;
const MAX_CONSECUTIVE_429 = 5;
const PAUSE_DURATION_MS = 60_000;

interface QueueItem {
  frame: CaptureFrame;
  transcription: string | null;
}

export class EmbedQueue {
  private queue: QueueItem[] = [];
  private processing = false;
  private consecutive429s = 0;
  private pausedUntil = 0;
  private backoffMs = 1000;
  private disposed = false;
  private fatalError: Error | null = null;

  private ai: GoogleGenAI;
  private onStore: (payload: StorePayload) => void;
  private onError: (error: Error) => void;

  constructor(
    ai: GoogleGenAI,
    onStore: (payload: StorePayload) => void,
    onError: (error: Error) => void,
  ) {
    this.ai = ai;
    this.onStore = onStore;
    this.onError = onError;
  }

  enqueue(frame: CaptureFrame, transcription: string | null): void {
    if (this.disposed || this.fatalError) return;

    // Backpressure: drop oldest if over limit
    if (this.queue.length >= MAX_PENDING) {
      this.queue.shift();
    }
    this.queue.push({ frame, transcription });
    this.processNext();
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get isPaused(): boolean {
    return Date.now() < this.pausedUntil;
  }

  clear(): void {
    this.queue = [];
  }

  dispose(): void {
    this.disposed = true;
    this.queue = [];
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.disposed || this.fatalError) return;
    if (this.queue.length === 0) return;

    // Check pause
    if (Date.now() < this.pausedUntil) return;

    this.processing = true;

    while (this.queue.length > 0) {
      if (this.disposed || this.fatalError) {
        this.processing = false;
        return;
      }

      if (Date.now() < this.pausedUntil) {
        this.processing = false;
        // Schedule retry after pause
        setTimeout(() => this.processNext(), this.pausedUntil - Date.now() + 100);
        return;
      }

      const item = this.queue.shift()!;

      try {
        const embedding = await this.embed(item);
        if (this.disposed) {
          this.processing = false;
          return;
        }

        // Build embed text for keyword search
        const timestamp = new Date(item.frame.timestamp).toISOString();
        const focusCount = item.frame.focusRegions.length;
        const transcriptionSnippet = item.transcription || '';
        const embedText = `[${timestamp}] Screen capture${focusCount > 0 ? `, ${focusCount} focus regions` : ''}. ${transcriptionSnippet}`;

        const payload: StorePayload = {
          id: `mp_${item.frame.timestamp}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: item.frame.timestamp,
          embedding: Array.from(embedding),
          transcription: item.transcription,
          screenshotBase64: item.frame.screenshotBase64,
          focusRegions: item.frame.focusRegions,
          connectionState: 'connected',
          embedText,
          embedModel: EMBED_MODEL,
        };

        this.onStore(payload);
        this.consecutive429s = 0;
        this.backoffMs = 1000;
      } catch (err: any) {
        if (err?.status === 429 || err?.message?.includes('429')) {
          this.consecutive429s++;
          console.warn(`[MindPalace] 429 rate limit (${this.consecutive429s}/${MAX_CONSECUTIVE_429}), backoff ${this.backoffMs}ms`);

          if (this.consecutive429s >= MAX_CONSECUTIVE_429) {
            this.pausedUntil = Date.now() + PAUSE_DURATION_MS;
            console.warn(`[MindPalace] Pausing embed pipeline for ${PAUSE_DURATION_MS / 1000}s`);
          }

          // Wait with exponential backoff
          await this.sleep(this.backoffMs);
          this.backoffMs = Math.min(this.backoffMs * 2, 16000);

          // Re-queue the failed item at the front
          this.queue.unshift(item);
        } else if (isCredentialError(err)) {
          this.fatalError = err instanceof Error
            ? err
            : new Error(getCredentialErrorMessage(err, 'access to Mind Palace embeddings') || String(err));
          this.queue = [];
          this.processing = false;
          this.onError(this.fatalError);
          return;
        } else {
          console.error('[MindPalace] Embed error:', err);
          this.onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    this.processing = false;
  }

  private async embed(item: QueueItem): Promise<Float32Array> {
    const images: Array<{ base64: string; mimeType: string }> = [];

    if (item.frame.screenshotBase64) {
      images.push({ base64: item.frame.screenshotBase64, mimeType: 'image/jpeg' });
    }

    for (const fr of item.frame.focusRegions.slice(0, 5)) {
      images.push({ base64: fr.base64, mimeType: 'image/png' });
    }

    return embedMultimodal(this.ai, {
      images,
      text: item.transcription || undefined,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
