import { LaserPoint, DrawStroke, AIOverlay } from '../types';

// ─── Shared geometry helper ───────────────────────────────────────────────────
export function createRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ─── Laser Pointer Renderer ───────────────────────────────────────────────────
const LASER_TRAIL_MS = 800;
const LASER_DOT_FADE_MS = 400;

export function renderLaserTrail(
  ctx: CanvasRenderingContext2D,
  points: LaserPoint[],
  time: number
) {
  const recent = points.filter(p => time - p.time < LASER_TRAIL_MS);
  if (recent.length === 0) return;

  ctx.save();

  // Trail segments — each fades based on age
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1];
    const curr = recent[i];
    const alpha = Math.max(0, 1 - (time - curr.time) / LASER_TRAIL_MS);

    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
    ctx.strokeStyle = `rgba(255, 60, 60, ${alpha * 0.5})`;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Glow trail (wider, more transparent)
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1];
    const curr = recent[i];
    const alpha = Math.max(0, 1 - (time - curr.time) / LASER_TRAIL_MS);

    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
    ctx.strokeStyle = `rgba(255, 40, 40, ${alpha * 0.15})`;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Cursor dot (latest point)
  const latest = recent[recent.length - 1];
  const dotAlpha = Math.max(0, 1 - (time - latest.time) / LASER_DOT_FADE_MS);

  if (dotAlpha > 0) {
    // Outer glow
    ctx.beginPath();
    ctx.arc(latest.x, latest.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 60, 60, ${dotAlpha * 0.3})`;
    ctx.shadowColor = `rgba(255, 30, 30, ${dotAlpha})`;
    ctx.shadowBlur = 25;
    ctx.fill();

    // Mid ring
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(latest.x, latest.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 80, 80, ${dotAlpha * 0.8})`;
    ctx.fill();

    // Bright core
    ctx.beginPath();
    ctx.arc(latest.x, latest.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 210, 210, ${dotAlpha})`;
    ctx.fill();
  }

  ctx.restore();
}

// Prune old points (call from RAF loop to keep array bounded)
export function pruneLaserPoints(points: LaserPoint[], time: number): LaserPoint[] {
  return points.filter(p => time - p.time < LASER_TRAIL_MS + 100);
}

// ─── Free-Draw Stroke Renderer ───────────────────────────────────────────────
function drawSmoothLine(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  alpha: number = 1
) {
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  // Quadratic curve smoothing
  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }

  // Final segment
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);

  ctx.strokeStyle = `rgba(160, 120, 255, ${alpha * 0.85})`;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = `rgba(140, 80, 255, ${alpha * 0.4})`;
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

export function renderDrawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: DrawStroke[],
  currentStroke: Array<{ x: number; y: number }> | null,
  _time: number,
  hoveredStrokeId?: string | null
) {
  ctx.save();
  strokes.forEach(s => {
    const isHovered = hoveredStrokeId === s.id;
    if (isHovered) {
      // Draw hovered stroke dimmed with red tint
      ctx.save();
      ctx.globalAlpha = 0.4;
      drawSmoothLine(ctx, s.points, 1);
      ctx.restore();

      // Draw red X at the midpoint of the stroke
      const mid = s.points[Math.floor(s.points.length / 2)];
      ctx.save();
      // White circle background
      ctx.beginPath();
      ctx.arc(mid.x, mid.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#FFF';
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
      // Red X
      ctx.beginPath();
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.moveTo(mid.x - 4, mid.y - 4);
      ctx.lineTo(mid.x + 4, mid.y + 4);
      ctx.moveTo(mid.x + 4, mid.y - 4);
      ctx.lineTo(mid.x - 4, mid.y + 4);
      ctx.stroke();
      ctx.restore();
    } else {
      drawSmoothLine(ctx, s.points, 1);
    }
  });
  if (currentStroke && currentStroke.length >= 2) {
    drawSmoothLine(ctx, currentStroke, 0.65);
  }
  ctx.restore();
}

// ─── AI Overlay Renderer ──────────────────────────────────────────────────────
export function renderAIOverlays(
  ctx: CanvasRenderingContext2D,
  overlays: AIOverlay[],
  time: number,
  breathCycle: number
) {
  overlays.forEach(overlay => {
    const age = time - overlay.createdAt;

    // Fade in 300ms
    let alpha = Math.min(1, age / 300);

    // Fade out last 500ms of duration
    if (overlay.duration > 0) {
      const remaining = overlay.duration - age;
      if (remaining < 500) alpha *= Math.max(0, remaining / 500);
      if (remaining <= 0) return; // expired
    }

    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    switch (overlay.type) {
      case 'highlight': {
        const w = overlay.width || 200;
        const h = overlay.height || 100;

        ctx.beginPath();
        createRoundedRectPath(ctx, overlay.x, overlay.y, w, h, 16);
        ctx.fillStyle = 'rgba(255, 180, 0, 0.06)';
        ctx.fill();

        // Amber dashed border
        ctx.shadowColor = `rgba(255, 160, 0, ${0.4 + breathCycle * 0.2})`;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = 'rgba(255, 200, 80, 0.8)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        if (overlay.label) {
          ctx.font = '11px Inter, system-ui, sans-serif';
          const textW = ctx.measureText(overlay.label).width + 16;
          const labelX = overlay.x + w / 2 - textW / 2;
          const labelY = overlay.y - 28;

          ctx.fillStyle = 'rgba(255, 180, 0, 0.92)';
          ctx.beginPath();
          createRoundedRectPath(ctx, labelX, labelY, textW, 22, 6);
          ctx.fill();

          ctx.fillStyle = '#000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(overlay.label, overlay.x + w / 2, labelY + 11);
        }
        break;
      }

      case 'pointer': {
        const size = 8 + breathCycle * 3;
        ctx.beginPath();
        ctx.arc(overlay.x, overlay.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 180, 0, ${0.35 + breathCycle * 0.3})`;
        ctx.shadowColor = 'rgba(255, 160, 0, 0.8)';
        ctx.shadowBlur = 25;
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(overlay.x, overlay.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 230, 150, 1)';
        ctx.fill();

        if (overlay.label) {
          ctx.font = '12px Inter, system-ui, sans-serif';
          ctx.fillStyle = 'rgba(255, 200, 80, 0.9)';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(overlay.label, overlay.x + 18, overlay.y);
        }
        break;
      }

      case 'pulse': {
        const phase = (age % 2000) / 2000;
        const radius = 10 + phase * 60;
        const pulseAlpha = (1 - phase) * alpha;

        ctx.beginPath();
        ctx.arc(overlay.x, overlay.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 180, 0, ${pulseAlpha * 0.5})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Second ring (offset phase)
        const phase2 = ((age + 1000) % 2000) / 2000;
        const r2 = 10 + phase2 * 60;
        ctx.beginPath();
        ctx.arc(overlay.x, overlay.y, r2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 180, 0, ${(1 - phase2) * alpha * 0.3})`;
        ctx.stroke();

        // Center dot
        ctx.beginPath();
        ctx.arc(overlay.x, overlay.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 200, 80, ${alpha})`;
        ctx.fill();
        break;
      }

      case 'callout': {
        const label = overlay.label || 'Note';
        ctx.font = '12px Inter, system-ui, sans-serif';
        const tw = ctx.measureText(label).width + 20;
        const th = 28;
        const bx = overlay.x + 14;
        const by = overlay.y - th / 2;

        // Connector line
        ctx.beginPath();
        ctx.moveTo(overlay.x, overlay.y);
        ctx.lineTo(bx, overlay.y);
        ctx.strokeStyle = 'rgba(255, 180, 0, 0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Dot
        ctx.beginPath();
        ctx.arc(overlay.x, overlay.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 200, 80, 1)';
        ctx.shadowColor = 'rgba(255, 160, 0, 0.6)';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label pill
        ctx.fillStyle = 'rgba(255, 180, 0, 0.92)';
        ctx.beginPath();
        createRoundedRectPath(ctx, bx, by, tw, th, 8);
        ctx.fill();

        ctx.fillStyle = '#000';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + 10, by + th / 2);
        break;
      }

      case 'circle': {
        const w = overlay.width || 100;
        const h = overlay.height || 100;
        const cx = overlay.x + w / 2;
        const cy = overlay.y + h / 2;
        const rx = w / 2;
        const ry = h / 2;

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 180, 0, 0.06)';
        ctx.fill();

        // Amber dashed border with breathing glow
        ctx.shadowColor = `rgba(255, 160, 0, ${0.4 + breathCycle * 0.2})`;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = 'rgba(255, 200, 80, 0.8)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        if (overlay.label) {
          ctx.font = '11px Inter, system-ui, sans-serif';
          const textW = ctx.measureText(overlay.label).width + 16;
          const labelX = cx - textW / 2;
          const labelY = overlay.y - 28;

          ctx.fillStyle = 'rgba(255, 180, 0, 0.92)';
          ctx.beginPath();
          createRoundedRectPath(ctx, labelX, labelY, textW, 22, 6);
          ctx.fill();

          ctx.fillStyle = '#000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(overlay.label, cx, labelY + 11);
        }
        break;
      }

      case 'arrow': {
        const tx = overlay.targetX ?? overlay.x;
        const ty = overlay.targetY ?? overlay.y;
        const dx = tx - overlay.x;
        const dy = ty - overlay.y;
        const angle = Math.atan2(dy, dx);
        const headLen = 14;

        // Shaft line
        ctx.beginPath();
        ctx.moveTo(overlay.x, overlay.y);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = 'rgba(255, 200, 80, 0.85)';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(255, 160, 0, 0.6)';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Arrowhead triangle
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(
          tx - headLen * Math.cos(angle - Math.PI / 6),
          ty - headLen * Math.sin(angle - Math.PI / 6),
        );
        ctx.lineTo(
          tx - headLen * Math.cos(angle + Math.PI / 6),
          ty - headLen * Math.sin(angle + Math.PI / 6),
        );
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 200, 80, 0.9)';
        ctx.fill();

        if (overlay.label) {
          ctx.font = '12px Inter, system-ui, sans-serif';
          ctx.fillStyle = 'rgba(255, 200, 80, 0.9)';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(overlay.label, overlay.x + 12, overlay.y - 12);
        }
        break;
      }
    }

    ctx.restore();
  });
}
