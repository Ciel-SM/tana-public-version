import { useState, useCallback, useRef, useEffect } from 'react';
import { AIOverlay, AIOverlayType } from '../types';

/**
 * Manages AI visual feedback overlays.
 * Overlays auto-dismiss after their duration elapses.
 * Used by useLiveApi to render model-driven annotations via function calling.
 */
export function useAIOverlays(onOverlayExpired?: (id: string) => void) {
  const [overlays, setOverlays] = useState<AIOverlay[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());
  const clearSnapshotsRef = useRef<Map<string, AIOverlay[]>>(new Map());
  const onOverlayExpiredRef = useRef(onOverlayExpired);
  onOverlayExpiredRef.current = onOverlayExpired;

  const addOverlay = useCallback((
    type: AIOverlayType,
    x: number,
    y: number,
    opts: { width?: number; height?: number; label?: string; duration?: number; targetX?: number; targetY?: number } = {}
  ): string => {
    const id = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const duration = opts.duration ?? 5000;

    const overlay: AIOverlay = {
      id,
      type,
      x,
      y,
      width: opts.width,
      height: opts.height,
      label: opts.label,
      targetX: opts.targetX,
      targetY: opts.targetY,
      createdAt: performance.now(),
      duration,
    };

    setOverlays(prev => [...prev, overlay]);

    if (duration > 0) {
      const timer = window.setTimeout(() => {
        setOverlays(prev => prev.filter(o => o.id !== id));
        timersRef.current.delete(id);
        onOverlayExpiredRef.current?.(id);
      }, duration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, []);

  const removeOverlay = useCallback((id: string) => {
    setOverlays(prev => prev.filter(o => o.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
  }, []);

  const clearAll = useCallback((snapshotKey?: string) => {
    setOverlays(prev => {
      if (snapshotKey) clearSnapshotsRef.current.set(snapshotKey, prev);
      return [];
    });
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current.clear();
  }, []);

  // Merge-append: restores saved overlays INTO current state (preserves post-clear overlays)
  const restoreSnapshot = useCallback((key: string) => {
    const saved = clearSnapshotsRef.current.get(key);
    if (!saved || saved.length === 0) return;
    clearSnapshotsRef.current.delete(key);

    const now = performance.now();
    setOverlays(prev => {
      const existingIds = new Set(prev.map(o => o.id));
      const toRestore = saved.filter(o => !existingIds.has(o.id));
      return [...prev, ...toRestore];
    });

    // Re-register auto-dismiss timers for restored overlays that haven't expired
    for (const overlay of saved) {
      if (overlay.duration <= 0) continue;
      if (timersRef.current.has(overlay.id)) continue; // already active
      const remaining = overlay.duration - (now - overlay.createdAt);
      if (remaining <= 0) continue;
      const timer = window.setTimeout(() => {
        setOverlays(prev => prev.filter(o => o.id !== overlay.id));
        timersRef.current.delete(overlay.id);
        onOverlayExpiredRef.current?.(overlay.id);
      }, remaining);
      timersRef.current.set(overlay.id, timer);
    }
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  return { overlays, addOverlay, removeOverlay, clearAll, restoreSnapshot };
}
