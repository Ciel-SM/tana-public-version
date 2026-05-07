import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { BoundingBox, ToolType, LaserPoint, DrawStroke, AIOverlay } from '../types';
import {
  createRoundedRectPath,
  renderLaserTrail,
  pruneLaserPoints,
  renderDrawStrokes,
  renderAIOverlays,
} from '../utils/canvas-renderers';

// ─── Public Handle ─────────────────────────────────────────────────────────────
export interface CanvasLayerHandle {
  startStreaming: () => Promise<boolean>;
  stopStreaming: () => void;
  captureRegion: (box: BoundingBox) => string | null;
  getArtifacts: () => { boxes: BoundingBox[]; strokes: DrawStroke[] };
  clearStrokes: () => void;
}

interface CanvasLayerProps {
  onFrameCapture: (base64: string) => void;
  onBoxCreated?: (box: BoundingBox, regionBase64: string | null) => void;
  onBoxCaptureFailed?: (box: BoundingBox) => void;
  onBoxDeleted?: (box: BoundingBox) => void;
  isStreaming: boolean;
  activeTool: ToolType;
  aiOverlays?: AIOverlay[];
}

// ─── Internal types ──────────────────────────────────────────────────────────
type DragMode = 'none' | 'drawing' | 'moving' | 'resizing' | 'free-drawing';
type ResizeCorner = 'nw' | 'ne' | 'se' | 'sw';

interface RenderableBox extends BoundingBox {
  isDeleting?: boolean;
  deletedAt?: number;
}

const HANDLE_RADIUS = 7;
const HANDLE_HIT_RADIUS = 16;
const MIN_BOX_SIZE = 30;

// ─── Component ─────────────────────────────────────────────────────────────────
const CanvasLayer = forwardRef<CanvasLayerHandle, CanvasLayerProps>(
  ({ onFrameCapture, onBoxCreated, onBoxCaptureFailed, onBoxDeleted, isStreaming, activeTool, aiOverlays }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const requestRef = useRef<number | null>(null);

    // ── Focus-box state ──────────────────────────────────────────────────────
    const [boundingBoxes, setBoundingBoxes] = useState<RenderableBox[]>([]);
    const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null);
    const [hoveredHandle, setHoveredHandle] = useState<ResizeCorner | null>(null);
    const [streamActive, setStreamActive] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const streamActiveRef = useRef(streamActive);

    const [dragMode, setDragMode] = useState<DragMode>('none');
    const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
    const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
    const [dragBoxId, setDragBoxId] = useState<string | null>(null);
    const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [boxAtDragStart, setBoxAtDragStart] = useState<{
      x: number; y: number; width: number; height: number;
    } | null>(null);
    const [resizeCorner, setResizeCorner] = useState<ResizeCorner | null>(null);

    // ── Free-draw state ─────────────────────────────────────────────────────
    const [drawStrokes, setDrawStrokes] = useState<DrawStroke[]>([]);
    const currentStrokeRef = useRef<Array<{ x: number; y: number }> | null>(null);

    // ── Free-draw hover state (for per-stroke delete) ──────────────────────
    const [hoveredStrokeId, setHoveredStrokeId] = useState<string | null>(null);

    // ── Laser state (fully ref-based) ────────────────────────────────────────
    const laserPointsRef = useRef<LaserPoint[]>([]);

    // ── Reset drag state when tool changes ──────────────────────────────────
    const prevToolRef = useRef(activeTool);
    useEffect(() => {
      if (prevToolRef.current !== activeTool) {
        // Clean up any in-progress interaction from the previous tool
        setDragMode('none');
        setStartPoint(null);
        setCurrentPoint(null);
        setDragBoxId(null);
        setBoxAtDragStart(null);
        setResizeCorner(null);
        currentStrokeRef.current = null;
        prevToolRef.current = activeTool;
      }
    }, [activeTool]);

    // ── Refs for props (RAF needs fresh values) ──────────────────────────────
    const activeToolRef = useRef(activeTool);
    activeToolRef.current = activeTool;
    const aiOverlaysRef = useRef(aiOverlays || []);
    aiOverlaysRef.current = aiOverlays || [];

    // ── State ref for RAF loop ──────────────────────────────────────────────
    const stateRef = useRef({
      boundingBoxes, hoveredBoxId, hoveredHandle, dragMode,
      startPoint, currentPoint, streamActive, drawStrokes, hoveredStrokeId,
    });
    useEffect(() => {
      stateRef.current = {
        boundingBoxes, hoveredBoxId, hoveredHandle, dragMode,
        startPoint, currentPoint, streamActive, drawStrokes, hoveredStrokeId,
      };
    }, [boundingBoxes, hoveredBoxId, hoveredHandle, dragMode, startPoint, currentPoint, streamActive, drawStrokes, hoveredStrokeId]);
    useEffect(() => {
      streamActiveRef.current = streamActive;
    }, [streamActive]);

    const renderRef = useRef<() => void>(() => {});

    const cancelScheduledFrame = () => {
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };

    const scheduleNextFrame = () => {
      if (!streamActiveRef.current || requestRef.current !== null) return;
      requestRef.current = requestAnimationFrame(() => {
        renderRef.current();
      });
    };

    // ── Imperative Handle ───────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      startStreaming: () => activateOverlay(),
      stopStreaming: () => deactivateOverlay(),
      captureRegion: (box: BoundingBox): string | null => {
        // In overlay mode, region capture is async via IPC — this sync version returns null
        // The actual capture happens in focusBoxUp via the onBoxCreated callback
        return null;
      },
      getArtifacts: () => ({
        boxes: boundingBoxes.filter(b => !b.isDeleting),
        strokes: drawStrokes,
      }),
      clearStrokes: () => setDrawStrokes([]),
    }));

    // ── Overlay Activation (replaces screen capture) ─────────────────────────
    const deactivateOverlay = () => {
      streamActiveRef.current = false;
      setStreamActive(false);
      setBoundingBoxes([]);
      setDrawStrokes([]);
      setHoveredBoxId(null);
      setDragMode('none');
      laserPointsRef.current = [];
      currentStrokeRef.current = null;
      // Sync stateRef immediately so any in-flight RAF frame reads cleared state
      stateRef.current.streamActive = false;
      stateRef.current.boundingBoxes = [];
      stateRef.current.drawStrokes = [];
      // Imperatively clear the canvas — don't wait for the RAF loop to catch up
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      cancelScheduledFrame();
    };

    const activateOverlay = async (): Promise<boolean> => {
      setError(null);
      if (!streamActiveRef.current) {
        streamActiveRef.current = true;
        setStreamActive(true);
      }
      scheduleNextFrame();
      return true;
    };

    // ── Canvas sizing (match window) ─────────────────────────────────────────
    useEffect(() => {
      const resize = () => {
        if (canvasRef.current && containerRef.current) {
          const dpr = window.devicePixelRatio || 1;
          const rect = containerRef.current.getBoundingClientRect();
          canvasRef.current.width = rect.width * dpr;
          canvasRef.current.height = rect.height * dpr;
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) ctx.scale(dpr, dpr);
        }
      };
      resize();
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }, []);

    // ═══════════════════════════════════════════════════════════════════════════
    //  MAIN RENDER LOOP — transparent canvas, overlays only
    // ═══════════════════════════════════════════════════════════════════════════
    const render = useCallback(() => {
      requestRef.current = null;

      if (!canvasRef.current) {
        scheduleNextFrame();
        return;
      }
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const {
        boundingBoxes, hoveredBoxId, hoveredHandle, dragMode,
        startPoint, currentPoint, streamActive, drawStrokes, hoveredStrokeId,
      } = stateRef.current;
      const activeTool = activeToolRef.current;
      const aiOverlays = aiOverlaysRef.current;

      if (!streamActive || !ctx) {
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      // Clear to transparent
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const time = performance.now();
      const breathCycle = (Math.sin(time / 1000) + 1) / 2;

      // ── 1. DIMMING with lens cutout (subtle overlay) ────────────────────
      if (boundingBoxes.length > 0 || (dragMode === 'drawing' && startPoint && currentPoint)) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        boundingBoxes.forEach(box => {
          if (!box.isDeleting) createRoundedRectPath(ctx, box.x, box.y, box.width, box.height, 24);
        });
        if (dragMode === 'drawing' && startPoint && currentPoint) {
          const x = Math.min(startPoint.x, currentPoint.x);
          const y = Math.min(startPoint.y, currentPoint.y);
          const bw = Math.abs(currentPoint.x - startPoint.x);
          const bh = Math.abs(currentPoint.y - startPoint.y);
          if (bw > 10 && bh > 10) createRoundedRectPath(ctx, x, y, bw, bh, 24);
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fill('evenodd');
        ctx.restore();
      }

      // ── 2. FOCUS BOXES ─────────────────────────────────────────────────
      boundingBoxes.forEach(box => {
        let opacity = 1, scale = 1;
        const age = time - box.createdAt;
        if (age < 300) { let t = age / 300; const e = (--t) * t * t + 1; opacity = e; scale = 0.98 + 0.02 * e; }
        if (box.isDeleting && box.deletedAt) {
          const d = time - box.deletedAt;
          if (d < 250) { const t = d / 250; opacity = 1 - t; scale = 1 - 0.05 * t; } else opacity = 0;
        }
        if (opacity <= 0) return;

        ctx.save();
        ctx.globalAlpha = opacity;
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        const bw = box.width * scale, bh = box.height * scale;
        const x = cx - bw / 2, y = cy - bh / 2, r = 24;
        ctx.beginPath();
        createRoundedRectPath(ctx, x, y, bw, bh, r);
        const isHov = hoveredBoxId === box.id;
        const glow = isHov ? 0.8 + breathCycle * 0.2 : 0.5 + breathCycle * 0.1;

        ctx.fillStyle = 'rgba(0, 150, 255, 0.03)'; ctx.fill();
        ctx.shadowColor = `rgba(0, 190, 255, ${glow})`; ctx.shadowBlur = isHov ? 35 : 25;
        ctx.strokeStyle = 'rgba(220, 245, 255, 1)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.shadowBlur = 0;

        if (isHov && !box.isDeleting) {
          // Delete button
          const bx = x + bw - 20, by = y + 20;
          ctx.beginPath(); ctx.arc(bx, by, 15, 0, Math.PI * 2); ctx.fillStyle = '#FFF'; ctx.fill();
          ctx.beginPath(); ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.moveTo(bx - 5, by - 5); ctx.lineTo(bx + 5, by + 5);
          ctx.moveTo(bx + 5, by - 5); ctx.lineTo(bx - 5, by + 5); ctx.stroke();

          // Resize handles
          [{ id: 'nw' as const, hx: x, hy: y }, { id: 'ne' as const, hx: x + bw, hy: y },
           { id: 'se' as const, hx: x + bw, hy: y + bh }, { id: 'sw' as const, hx: x, hy: y + bh }]
            .forEach(corner => {
              const act = hoveredHandle === corner.id;
              ctx.save();
              ctx.shadowColor = 'rgba(0, 190, 255, 0.9)'; ctx.shadowBlur = act ? 14 : 6;
              ctx.fillStyle = act ? 'rgba(0, 210, 255, 1)' : '#FFF';
              ctx.beginPath(); ctx.arc(corner.hx, corner.hy, HANDLE_RADIUS, 0, Math.PI * 2); ctx.fill();
              ctx.shadowBlur = 0;
              ctx.fillStyle = act ? '#FFF' : 'rgba(0, 190, 255, 0.8)';
              ctx.beginPath(); ctx.arc(corner.hx, corner.hy, 3, 0, Math.PI * 2); ctx.fill();
              ctx.restore();
            });
        }
        ctx.restore();
      });

      // ── 3. DRAWING PREVIEW ────────────────────────────────────────────
      if (dragMode === 'drawing' && startPoint && currentPoint) {
        const x = Math.min(startPoint.x, currentPoint.x);
        const y = Math.min(startPoint.y, currentPoint.y);
        const bw = Math.abs(currentPoint.x - startPoint.x);
        const bh = Math.abs(currentPoint.y - startPoint.y);
        if (bw > 5 && bh > 5) {
          ctx.save(); ctx.beginPath(); createRoundedRectPath(ctx, x, y, bw, bh, 24);
          ctx.fillStyle = 'rgba(0, 150, 255, 0.05)'; ctx.fill();
          ctx.shadowColor = 'rgba(0, 190, 255, 0.8)'; ctx.shadowBlur = 20;
          ctx.strokeStyle = 'rgba(200, 245, 255, 0.8)'; ctx.lineWidth = 2; ctx.stroke();
          ctx.restore();
        }
      }

      // ── 4. FREE-DRAW STROKES ──────────────────────────────────────────
      renderDrawStrokes(ctx, drawStrokes, currentStrokeRef.current, time, hoveredStrokeId);

      // ── 5. LASER TRAIL ────────────────────────────────────────────────
      laserPointsRef.current = pruneLaserPoints(laserPointsRef.current, time);
      renderLaserTrail(ctx, laserPointsRef.current, time);

      // ── 6. AI OVERLAYS ────────────────────────────────────────────────
      if (aiOverlays.length > 0) {
        renderAIOverlays(ctx, aiOverlays, time, breathCycle);
      }

      // ── 7. CLEANUP ────────────────────────────────────────────────────
      const dead = boundingBoxes.filter(b => b.isDeleting && b.deletedAt && time - b.deletedAt > 250).map(b => b.id);
      if (dead.length > 0) setBoundingBoxes(prev => prev.filter(b => !dead.includes(b.id)));

      scheduleNextFrame();
    }, []);
    renderRef.current = render;

    useEffect(() => {
      return () => cancelScheduledFrame();
    }, []);

    // ── On-demand frame capture for AI (only when region is created) ─────────
    // Periodic full-desktop capture is handled by the visual input queue hook.
    // This component only captures focus-region crops when the user draws a box.

    // ═══════════════════════════════════════════════════════════════════════════
    //  COORDINATE HELPERS
    // ═══════════════════════════════════════════════════════════════════════════
    const getCanvasCoords = (e: React.MouseEvent): { x: number; y: number } => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const getCanvasBounds = () => {
      if (!containerRef.current) return { width: 0, height: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    };

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

    const getResizeHandle = (box: RenderableBox, x: number, y: number): ResizeCorner | null => {
      for (const c of [
        { id: 'nw' as const, hx: box.x, hy: box.y },
        { id: 'ne' as const, hx: box.x + box.width, hy: box.y },
        { id: 'se' as const, hx: box.x + box.width, hy: box.y + box.height },
        { id: 'sw' as const, hx: box.x, hy: box.y + box.height },
      ]) { if (Math.sqrt((x - c.hx) ** 2 + (y - c.hy) ** 2) < HANDLE_HIT_RADIUS) return c.id; }
      return null;
    };

    const captureBoxRegion = (box: BoundingBox) => {
      if (!onBoxCreated) return;

      const failCapture = () => {
        setBoundingBoxes(prev => prev.filter(candidate => candidate.id !== box.id));
        onBoxCaptureFailed?.(box);
      };

      const tana = (window as any).tana;
      if (tana?.captureRegion) {
        const { width: viewportWidth, height: viewportHeight } = getCanvasBounds();
        tana.captureRegion(
          box.x,
          box.y,
          box.width,
          box.height,
          viewportWidth,
          viewportHeight,
        )
          .then((regionBase64: string | null) => {
            if (!regionBase64) {
              failCapture();
              return;
            }
            onBoxCreated(box, regionBase64);
          })
          .catch((e: any) => {
            console.error('[CanvasLayer] Region capture failed:', e);
            failCapture();
          });
        return;
      }

      failCapture();
    };

    const deleteBox = (boxId: string) => {
      const box = boundingBoxes.find(candidate => candidate.id === boxId);
      if (!box || box.isDeleting) return;

      setBoundingBoxes(p => p.map(b => b.id === boxId ? { ...b, isDeleting: true, deletedAt: performance.now() } : b));
      setHoveredBoxId(null);
      onBoxDeleted?.(box);
    };

    const updateHover = (x: number, y: number) => {
      let hitId: string | null = null;
      let hitH: ResizeCorner | null = null;
      for (let i = boundingBoxes.length - 1; i >= 0; i--) {
        const b = boundingBoxes[i];
        if (b.isDeleting) continue;
        const p = 10;
        if (x >= b.x - p && x <= b.x + b.width + p && y >= b.y - p && y <= b.y + b.height + p) {
          hitId = b.id;
          if (activeTool === 'focus-box') hitH = getResizeHandle(b, x, y);
          break;
        }
      }
      setHoveredBoxId(hitId);
      setHoveredHandle(hitH);
    };

    // ── Stroke hit-test (for per-stroke delete) ────────────────────────────
    const getStrokeAtPoint = (x: number, y: number): string | null => {
      const HIT_DIST = 12;
      for (let i = drawStrokes.length - 1; i >= 0; i--) {
        const stroke = drawStrokes[i];
        for (let j = 1; j < stroke.points.length; j++) {
          const a = stroke.points[j - 1], b = stroke.points[j];
          // Point-to-line-segment distance
          const dx = b.x - a.x, dy = b.y - a.y;
          const lenSq = dx * dx + dy * dy;
          const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lenSq));
          const px = a.x + t * dx, py = a.y + t * dy;
          const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
          if (dist < HIT_DIST) return stroke.id;
        }
      }
      return null;
    };

    // ── Cmd+Z / Ctrl+Z undo for strokes ──────────────────────────────────
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
          if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
          if (drawStrokes.length > 0) {
            e.preventDefault();
            setDrawStrokes(p => p.slice(0, -1));
          }
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [drawStrokes.length]);

    // ═══════════════════════════════════════════════════════════════════════════
    //  MOUSE EVENT HANDLERS
    // ═══════════════════════════════════════════════════════════════════════════

    const focusBoxDown = (x: number, y: number) => {
      if (hoveredBoxId) {
        const box = boundingBoxes.find(b => b.id === hoveredBoxId);
        if (box && !box.isDeleting) {
          // Check resize handles FIRST (they overlap with the delete button area)
          const h = getResizeHandle(box, x, y);
          if (h) {
            setDragMode('resizing'); setDragBoxId(hoveredBoxId); setResizeCorner(h);
            setDragOrigin({ x, y }); setBoxAtDragStart({ x: box.x, y: box.y, width: box.width, height: box.height });
            return;
          }
          // Then check delete button (reduced radius to avoid corner overlap)
          const bx = box.x + box.width - 20, by = box.y + 20;
          if (Math.sqrt((x - bx) ** 2 + (y - by) ** 2) < 18) {
            deleteBox(hoveredBoxId);
            return;
          }
          setDragMode('moving'); setDragBoxId(hoveredBoxId);
          setDragOrigin({ x, y }); setBoxAtDragStart({ x: box.x, y: box.y, width: box.width, height: box.height });
          return;
        }
      }
      setStartPoint({ x, y }); setCurrentPoint({ x, y }); setDragMode('drawing'); setHoveredBoxId(null);
    };

    const focusBoxMove = (x: number, y: number) => {
      if (dragMode === 'moving' && dragBoxId && boxAtDragStart) {
        const dx = x - dragOrigin.x, dy = y - dragOrigin.y;
        const { width: canvasWidth, height: canvasHeight } = getCanvasBounds();
        const nextX = clamp(boxAtDragStart.x + dx, 0, Math.max(0, canvasWidth - boxAtDragStart.width));
        const nextY = clamp(boxAtDragStart.y + dy, 0, Math.max(0, canvasHeight - boxAtDragStart.height));
        setBoundingBoxes(p => p.map(b => b.id === dragBoxId ? { ...b, x: nextX, y: nextY } : b));
        return;
      }
      if (dragMode === 'resizing' && dragBoxId && boxAtDragStart && resizeCorner) {
        const dx = x - dragOrigin.x, dy = y - dragOrigin.y;
        const { x: ox, y: oy, width: ow, height: oh } = boxAtDragStart;
        const { width: canvasWidth, height: canvasHeight } = getCanvasBounds();
        const right = ox + ow;
        const bottom = oy + oh;
        let nx = ox, ny = oy, nw = ow, nh = oh;
        switch (resizeCorner) {
          case 'nw': {
            nx = clamp(ox + dx, 0, right - MIN_BOX_SIZE);
            ny = clamp(oy + dy, 0, bottom - MIN_BOX_SIZE);
            nw = right - nx;
            nh = bottom - ny;
            break;
          }
          case 'ne': {
            const nextRight = clamp(right + dx, ox + MIN_BOX_SIZE, canvasWidth);
            ny = clamp(oy + dy, 0, bottom - MIN_BOX_SIZE);
            nw = nextRight - ox;
            nh = bottom - ny;
            break;
          }
          case 'se': {
            const nextRight = clamp(right + dx, ox + MIN_BOX_SIZE, canvasWidth);
            const nextBottom = clamp(bottom + dy, oy + MIN_BOX_SIZE, canvasHeight);
            nw = nextRight - ox;
            nh = nextBottom - oy;
            break;
          }
          case 'sw': {
            nx = clamp(ox + dx, 0, right - MIN_BOX_SIZE);
            const nextBottom = clamp(bottom + dy, oy + MIN_BOX_SIZE, canvasHeight);
            nw = right - nx;
            nh = nextBottom - oy;
            break;
          }
        }
        setBoundingBoxes(p => p.map(b => b.id === dragBoxId ? { ...b, x: nx, y: ny, width: nw, height: nh } : b));
        return;
      }
      if (dragMode === 'drawing') { setCurrentPoint({ x, y }); return; }
      updateHover(x, y);
    };

    const focusBoxUp = async (x: number, y: number) => {
      if (dragMode === 'drawing' && startPoint) {
        const bw = x - startPoint.x, bh = y - startPoint.y;
        if (Math.abs(bw) > 10 && Math.abs(bh) > 10) {
          const nb: RenderableBox = {
            id: Date.now().toString(),
            x: bw > 0 ? startPoint.x : x, y: bh > 0 ? startPoint.y : y,
            width: Math.abs(bw), height: Math.abs(bh), label: 'Selected', createdAt: performance.now(),
          };

          // Add the box immediately so there's no visual gap
          setBoundingBoxes(p => [...p, nb]);

          // Clear drag state now (preview -> committed box, seamless transition)
          setDragMode('none'); setStartPoint(null); setCurrentPoint(null);
          setDragBoxId(null); setBoxAtDragStart(null); setResizeCorner(null);

          // Capture region in background after creation so the live visual stream matches the box.
          captureBoxRegion(nb);
          return; // Skip the cleanup in handleMouseUp (already done above)
        }
      }

      if ((dragMode === 'moving' || dragMode === 'resizing') && dragBoxId && boxAtDragStart) {
        const finalBox = stateRef.current.boundingBoxes.find(b => b.id === dragBoxId && !b.isDeleting);
        if (!finalBox) return;

        const geometryChanged =
          finalBox.x !== boxAtDragStart.x ||
          finalBox.y !== boxAtDragStart.y ||
          finalBox.width !== boxAtDragStart.width ||
          finalBox.height !== boxAtDragStart.height;

        if (geometryChanged) {
          captureBoxRegion(finalBox);
        }
      }
    };

    const laserMove = (x: number, y: number) => {
      laserPointsRef.current.push({ x, y, time: performance.now() });
      updateHover(x, y);
    };

    const freeDrawDown = (x: number, y: number) => {
      // If hovering a stroke, delete it on click
      if (hoveredStrokeId) {
        setDrawStrokes(p => p.filter(s => s.id !== hoveredStrokeId));
        setHoveredStrokeId(null);
        return;
      }
      currentStrokeRef.current = [{ x, y }];
      setDragMode('free-drawing');
    };

    const freeDrawMove = (x: number, y: number) => {
      if (dragMode === 'free-drawing' && currentStrokeRef.current) {
        currentStrokeRef.current.push({ x, y });
        return;
      }
      // Hit-test strokes for hover-to-delete
      setHoveredStrokeId(getStrokeAtPoint(x, y));
      updateHover(x, y);
    };

    const freeDrawUp = () => {
      if (currentStrokeRef.current && currentStrokeRef.current.length >= 2) {
        const stroke: DrawStroke = {
          id: `stroke-${Date.now()}`,
          points: [...currentStrokeRef.current],
          createdAt: performance.now(),
        };
        setDrawStrokes(p => [...p, stroke]);
      }
      currentStrokeRef.current = null;
    };

    // ── Dispatchers ─────────────────────────────────────────────────────────
    const handleMouseDown = (e: React.MouseEvent) => {
      if (!streamActive || activeTool === 'cursor') return;
      const { x, y } = getCanvasCoords(e);
      switch (activeTool) {
        case 'focus-box': focusBoxDown(x, y); break;
        case 'laser-pointer': break;
        case 'free-draw': freeDrawDown(x, y); break;
      }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      if (!streamActive || activeTool === 'cursor') return;
      const { x, y } = getCanvasCoords(e);
      switch (activeTool) {
        case 'focus-box': focusBoxMove(x, y); break;
        case 'laser-pointer': laserMove(x, y); break;
        case 'free-draw': freeDrawMove(x, y); break;
      }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
      if (!streamActive || activeTool === 'cursor') return;
      const { x, y } = getCanvasCoords(e);
      switch (activeTool) {
        case 'focus-box': focusBoxUp(x, y); break;
        case 'free-draw': freeDrawUp(); break;
      }
      setDragMode('none'); setStartPoint(null); setCurrentPoint(null);
      setDragBoxId(null); setBoxAtDragStart(null); setResizeCorner(null);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      if (hoveredBoxId) {
        deleteBox(hoveredBoxId);
      } else if (drawStrokes.length > 0) {
        // Undo last stroke (works from any tool mode)
        setDrawStrokes(p => p.slice(0, -1));
      }
    };

    // ── Cursor ──────────────────────────────────────────────────────────────
    const getCursor = (): string => {
      if (!streamActive) return 'default';
      if (dragMode === 'moving') return 'grabbing';
      if (dragMode === 'resizing') {
        const m: Record<ResizeCorner, string> = { nw: 'nw-resize', ne: 'ne-resize', se: 'se-resize', sw: 'sw-resize' };
        return resizeCorner ? m[resizeCorner] : 'crosshair';
      }
      if (activeTool === 'focus-box') {
        if (hoveredHandle) {
          const m: Record<ResizeCorner, string> = { nw: 'nw-resize', ne: 'ne-resize', se: 'se-resize', sw: 'sw-resize' };
          return m[hoveredHandle];
        }
        if (hoveredBoxId) return 'grab';
        return 'crosshair';
      }
      if (activeTool === 'cursor') return 'default';
      if (activeTool === 'laser-pointer') return 'none';
      if (activeTool === 'free-draw') {
        if (hoveredStrokeId) return 'pointer'; // Hovering a stroke — click to delete
        // Pen cursor via inline SVG
        return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 19 7-7 3 3-7 7-3-3z'/%3E%3Cpath d='m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z'/%3E%3Cpath d='m2 2 7.586 7.586'/%3E%3Ccircle cx='11' cy='11' r='2'/%3E%3C/svg%3E") 2 22, crosshair`;
      }
      return 'crosshair';
    };

    // ── JSX ──────────────────────────────────────────────────────────────────
    return (
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden"
        style={{
          cursor: getCursor(),
          pointerEvents: activeTool === 'cursor' ? 'none' : 'auto',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
      >
        {/* Error display (only when not active) */}
        {!streamActive && error && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="p-5 bg-red-900/80 border border-red-500/50 rounded-xl text-red-200 text-sm max-w-lg whitespace-pre-wrap pointer-events-auto backdrop-blur-sm space-y-4">
              <p>{error}</p>
              <button
                onClick={() => (window as any).tana?.relaunch?.()}
                className="w-full py-2 px-4 rounded-lg bg-red-500/30 hover:bg-red-500/50 border border-red-400/40 text-red-100 text-xs font-semibold tracking-wide transition-all active:scale-95"
              >
                Relaunch Tana
              </button>
            </div>
          </div>
        )}

        {/* Transparent canvas — only draws overlay elements */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
        />
      </div>
    );
  }
);

export default CanvasLayer;
