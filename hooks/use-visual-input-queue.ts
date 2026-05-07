import { useCallback, useEffect, useRef } from 'react';
import { BoundingBox, ConnectionState, FocusQueueEntry, LatestScreenshotFrame, VisualSource } from '../types';
import type { CaptureFrame } from '../lib/mind-palace/types';

const FAILURE_THRESHOLD = 3;

interface UseVisualInputQueueOptions {
  captureIntervalMs?: number;
  jpegQuality?: number;
  maxFocusRegions?: number;
}

interface UseVisualInputQueueResult {
  upsertFocusRegion: (box: BoundingBox, base64Png: string) => void;
  removeFocusRegion: (boxId: string) => void;
  clear: () => void;
}

export function useVisualInputQueue(
  connectionState: ConnectionState,
  sendRealtimeImage: (base64Image: string, mimeType: 'image/jpeg' | 'image/png') => void,
  sendTextContext: (text: string) => void,
  onCaptureTick?: (frame: CaptureFrame) => void,
  options?: UseVisualInputQueueOptions,
): UseVisualInputQueueResult {
  const captureIntervalMs = options?.captureIntervalMs ?? 1000;
  const jpegQuality = options?.jpegQuality ?? 75;
  const maxFocusRegions = Math.max(1, options?.maxFocusRegions ?? Number.POSITIVE_INFINITY);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTickRunningRef = useRef(false);
  const latestScreenshotRef = useRef<LatestScreenshotFrame | null>(null);
  const focusEntriesRef = useRef<Map<string, FocusQueueEntry>>(new Map());
  const focusOrderRef = useRef<string[]>([]);
  const nextSourceRef = useRef<VisualSource>('screen');
  const nextFocusIndexRef = useRef(0);
  const failCountRef = useRef(0);
  const hasSentWarningRef = useRef(false);

  const resetSchedulerState = useCallback((clearFocus: boolean) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    isTickRunningRef.current = false;
    latestScreenshotRef.current = null;
    nextSourceRef.current = 'screen';
    nextFocusIndexRef.current = 0;
    failCountRef.current = 0;
    hasSentWarningRef.current = false;

    if (clearFocus) {
      focusEntriesRef.current.clear();
      focusOrderRef.current = [];
    }
  }, []);

  const clear = useCallback(() => {
    resetSchedulerState(true);
  }, [resetSchedulerState]);

  const upsertFocusRegion = useCallback((box: BoundingBox, base64Png: string) => {
    focusEntriesRef.current.set(box.id, {
      boxId: box.id,
      box,
      base64: base64Png,
      mimeType: 'image/png',
      updatedAt: Date.now(),
    });

    if (!focusOrderRef.current.includes(box.id)) {
      focusOrderRef.current = [...focusOrderRef.current, box.id];
    }

    while (focusOrderRef.current.length > maxFocusRegions) {
      const oldestId = focusOrderRef.current.shift();
      if (oldestId) {
        focusEntriesRef.current.delete(oldestId);
      }
    }
  }, [maxFocusRegions]);

  const removeFocusRegion = useCallback((boxId: string) => {
    focusEntriesRef.current.delete(boxId);

    const nextOrder = focusOrderRef.current.filter(id => id !== boxId);
    focusOrderRef.current = nextOrder;

    if (nextOrder.length === 0) {
      nextFocusIndexRef.current = 0;
      nextSourceRef.current = 'screen';
      return;
    }

    nextFocusIndexRef.current %= nextOrder.length;
  }, []);

  const captureLatestScreenshot = useCallback(async () => {
    const tana = (window as any).tana;
    if (!tana?.captureScreenshotJpeg) {
      latestScreenshotRef.current = null;
      return;
    }

    try {
      const base64: string | null = await tana.captureScreenshotJpeg(jpegQuality);
      if (base64) {
        if (hasSentWarningRef.current) {
          sendTextContext('[SYSTEM: Screen capture restored. You can now see the user\'s screen.]');
          hasSentWarningRef.current = false;
        }
        failCountRef.current = 0;
        latestScreenshotRef.current = {
          base64,
          mimeType: 'image/jpeg',
          capturedAt: Date.now(),
        };
        return;
      }

      latestScreenshotRef.current = null;
      failCountRef.current++;
      if (failCountRef.current >= FAILURE_THRESHOLD && !hasSentWarningRef.current) {
        sendTextContext('[SYSTEM: Screen capture is currently unavailable. Do not describe or guess what is on the user\'s screen.]');
        hasSentWarningRef.current = true;
      }
    } catch (err) {
      console.error('[useVisualInputQueue] screenshot capture failed:', err);
      latestScreenshotRef.current = null;
      failCountRef.current++;
      if (failCountRef.current >= FAILURE_THRESHOLD && !hasSentWarningRef.current) {
        sendTextContext('[SYSTEM: Screen capture is currently unavailable. Do not describe or guess what is on the user\'s screen.]');
        hasSentWarningRef.current = true;
      }
    }
  }, [jpegQuality, sendTextContext]);

  const sendNextFrame = useCallback(() => {
    const latestScreenshot = latestScreenshotRef.current;
    const focusOrder = focusOrderRef.current.filter(id => focusEntriesRef.current.has(id));
    if (focusOrder.length !== focusOrderRef.current.length) {
      focusOrderRef.current = focusOrder;
      if (focusOrder.length === 0) {
        nextFocusIndexRef.current = 0;
      } else {
        nextFocusIndexRef.current %= focusOrder.length;
      }
    }

    if (nextSourceRef.current === 'screen') {
      if (latestScreenshot) {
        sendRealtimeImage(latestScreenshot.base64, latestScreenshot.mimeType);
      }
      nextSourceRef.current = focusOrder.length > 0 ? 'focus' : 'screen';
      return;
    }

    if (focusOrder.length > 0) {
      const focusId = focusOrder[nextFocusIndexRef.current];
      const focusEntry = focusEntriesRef.current.get(focusId);
      if (focusEntry) {
        sendRealtimeImage(focusEntry.base64, focusEntry.mimeType);
        nextFocusIndexRef.current = (nextFocusIndexRef.current + 1) % focusOrder.length;
      }
      nextSourceRef.current = 'screen';
      return;
    }

    if (latestScreenshot) {
      sendRealtimeImage(latestScreenshot.base64, latestScreenshot.mimeType);
    }
    nextSourceRef.current = 'screen';
  }, [sendRealtimeImage]);

  const tick = useCallback(async () => {
    if (isTickRunningRef.current) return;
    isTickRunningRef.current = true;

    try {
      await captureLatestScreenshot();
      sendNextFrame();

      // Fire Mind Palace capture tick callback
      if (onCaptureTick) {
        const screenshot = latestScreenshotRef.current;
        const focusEntries = Array.from(focusEntriesRef.current.values()).slice(0, maxFocusRegions);
        onCaptureTick({
          screenshotBase64: screenshot?.base64 ?? null,
          focusRegions: focusEntries.map(f => ({ boxId: f.boxId, base64: f.base64 })),
          timestamp: Date.now(),
        });
      }
    } finally {
      isTickRunningRef.current = false;
    }
  }, [captureLatestScreenshot, maxFocusRegions, onCaptureTick, sendNextFrame]);

  useEffect(() => {
    if (connectionState === 'connected') {
      void tick();
      intervalRef.current = setInterval(() => {
        void tick();
      }, captureIntervalMs);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }

    if (connectionState === 'connecting') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      latestScreenshotRef.current = null;
      isTickRunningRef.current = false;
      return;
    }

    resetSchedulerState(true);
  }, [captureIntervalMs, connectionState, resetSchedulerState, tick]);

  return {
    upsertFocusRegion,
    removeFocusRegion,
    clear,
  };
}
