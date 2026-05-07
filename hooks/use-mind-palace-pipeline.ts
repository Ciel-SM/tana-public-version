import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { EmbedQueue } from '../lib/mind-palace/embed-queue';
import type { CaptureFrame, StorePayload, MindPalaceStats } from '../lib/mind-palace/types';
import type { Message } from '../types';
import { getCredentialErrorMessage, normalizeApiKey } from '../lib/google-api-errors';

const STORAGE_KEY = 'tana_mind_palace_enabled';

interface UseMindPalacePipelineOptions {
  apiKey: string | null;
  messages: Message[];
}

interface UseMindPalacePipelineResult {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  initialize: () => Promise<void>;
  onCaptureTick: (frame: CaptureFrame) => void;
  stats: MindPalaceStats | null;
  refreshStats: () => void;
  isInitialized: boolean;
  pendingEmbeds: number;
}

export function useMindPalacePipeline({
  apiKey,
  messages,
}: UseMindPalacePipelineOptions): UseMindPalacePipelineResult {
  const [enabled, setEnabledState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [stats, setStats] = useState<MindPalaceStats | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [pendingEmbeds, setPendingEmbeds] = useState(0);

  const embedQueueRef = useRef<EmbedQueue | null>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);
  const lastTranscriptionRef = useRef<string>('');
  const initPromiseRef = useRef<Promise<void> | null>(null);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {}
  }, []);

  const initialize = useCallback(async () => {
    const tana = (window as any).tana;
    if (!tana?.mindPalace?.initialize) return;

    if (!initPromiseRef.current) {
      initPromiseRef.current = tana.mindPalace.initialize()
        .then(() => {
          setIsInitialized(true);
          // Refresh stats on init
          tana.mindPalace.getStats?.().then((s: MindPalaceStats) => setStats(s));
        })
        .catch((err: Error) => {
          initPromiseRef.current = null;
          console.error('[MindPalace] Failed to initialize storage:', err);
          throw err;
        });
    }

    await initPromiseRef.current;
  }, []);

  useEffect(() => {
    if (enabled) {
      void initialize();
    }
  }, [enabled, initialize]);

  // Create/recreate AI client and embed queue when API key changes
  useEffect(() => {
    const normalizedApiKey = normalizeApiKey(apiKey);

    if (!enabled || !normalizedApiKey) {
      aiRef.current = null;
      embedQueueRef.current = null;
      setPendingEmbeds(0);
      return;
    }

    const ai = new GoogleGenAI({ apiKey: normalizedApiKey });
    aiRef.current = ai;

    const tana = (window as any).tana;

    const queue = new EmbedQueue(
      ai,
      (payload: StorePayload) => {
        // Store via IPC
        tana?.mindPalace?.storeMemory?.(payload)
          .then(() => {
            setPendingEmbeds(queue.pendingCount);
          })
          .catch((err: Error) => {
            console.error('[MindPalace] Store error:', err);
          });
      },
      (err: Error) => {
        setPendingEmbeds(queue.pendingCount);
        const message = getCredentialErrorMessage(err, 'access to Mind Palace embeddings');
        if (message) {
          console.warn(`[MindPalace] ${message}`);
          return;
        }

        console.error('[MindPalace] Embed pipeline error:', err);
      },
    );

    embedQueueRef.current = queue;

    return () => {
      queue.dispose();
    };
  }, [apiKey, enabled]);

  // Build transcription diff from messages
  const getTranscriptionDiff = useCallback((): string | null => {
    const recentMessages = messages.slice(-4);
    const transcript = recentMessages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? 'User' : 'Model'}: "${m.text}"`)
      .join(' ');

    if (transcript === lastTranscriptionRef.current) return null;
    lastTranscriptionRef.current = transcript;
    return transcript;
  }, [messages]);

  const onCaptureTick = useCallback((frame: CaptureFrame) => {
    if (!enabled || !embedQueueRef.current || !isInitialized) return;

    const transcription = getTranscriptionDiff();
    embedQueueRef.current.enqueue(frame, transcription);
    setPendingEmbeds(embedQueueRef.current.pendingCount);
  }, [enabled, isInitialized, getTranscriptionDiff]);

  const refreshStats = useCallback(() => {
    const tana = (window as any).tana;
    if (!tana?.mindPalace?.getStats) return;

    void initialize().then(() => {
      tana.mindPalace.getStats().then((s: MindPalaceStats) => setStats(s));
    }).catch((err: Error) => {
      console.error('[MindPalace] Failed to refresh stats:', err);
    });
  }, [initialize]);

  // Refresh stats periodically when enabled
  useEffect(() => {
    if (!enabled || !isInitialized) return;

    refreshStats();
    const interval = setInterval(refreshStats, 10_000);
    return () => clearInterval(interval);
  }, [enabled, isInitialized, refreshStats]);

  return {
    enabled,
    setEnabled,
    initialize,
    onCaptureTick,
    stats,
    refreshStats,
    isInitialized,
    pendingEmbeds,
  };
}
