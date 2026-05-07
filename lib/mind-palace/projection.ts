// UMAP projection: 3072-dim embeddings → 3D coordinates
// Runs in the renderer (could be offloaded to a worker for large datasets).

import { UMAP } from 'umap-js';

export interface ProjectedPoint {
  id: string;
  timestamp: number;
  x: number;
  y: number;
  z: number;
}

export function projectToUMAP3D(
  records: Array<{ id: string; timestamp: number; embedding: Float32Array }>,
  maxPoints = 5000,
): ProjectedPoint[] {
  if (records.length === 0) return [];

  // Cap to most recent N
  const capped = records.length > maxPoints
    ? records.slice(records.length - maxPoints)
    : records;

  // Convert to number[][] for umap-js
  const data: number[][] = capped.map(r => Array.from(r.embedding));

  const umap = new UMAP({
    nComponents: 3,
    nNeighbors: Math.min(15, Math.max(2, capped.length - 1)),
    minDist: 0.1,
    spread: 1.0,
  });

  const projected = umap.fit(data);

  // --- Normalize: center at origin and scale to fill visible radius ---
  const n = projected.length;
  if (n === 0) return [];

  // Compute centroid
  let cx = 0, cy = 0, cz = 0;
  for (const p of projected) { cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= n; cy /= n; cz /= n;

  // Center and find max distance from origin
  const centered = projected.map(p => [p[0] - cx, p[1] - cy, p[2] - cz] as [number, number, number]);
  let maxDist = 0;
  for (const p of centered) {
    const d = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
    if (d > maxDist) maxDist = d;
  }

  const targetRadius = 8;
  const scale = maxDist > 1e-6 ? targetRadius / maxDist : 1;

  return capped.map((record, i) => ({
    id: record.id,
    timestamp: record.timestamp,
    x: centered[i][0] * scale,
    y: centered[i][1] * scale,
    z: centered[i][2] * scale,
  }));
}
