import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { ProjectedPoint } from '../lib/mind-palace/projection';
import type { MemoryMeta } from '../lib/mind-palace/types';

interface MindPalace3DSceneProps {
  points: ProjectedPoint[];
  minTime: number;
  maxTime: number;
  metadataMap: Map<string, MemoryMeta>;
}

// Color gradient: cool blue (old) -> warm orange (recent)
function getColor(timestamp: number, minTime: number, maxTime: number): THREE.Color {
  const t = maxTime > minTime ? (timestamp - minTime) / (maxTime - minTime) : 0.5;
  // HSL: blue (220) -> purple (280) -> orange (30)
  const hue = 220 + t * 170; // wraps through purple to orange
  const normalizedHue = ((hue % 360) + 360) % 360;
  return new THREE.Color().setHSL(normalizedHue / 360, 0.7, 0.55);
}

function formatTooltipTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const timeStr = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `Today ${timeStr}`;
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${timeStr}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '...';
}

const BASE_SCALE = 0.15;
const HOVER_SCALE = 0.30;

const MindPalace3DScene: React.FC<MindPalace3DSceneProps> = ({
  points,
  minTime,
  maxTime,
  metadataMap,
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const lastPointerMoveTime = useRef(0);
  const prevHoveredIndex = useRef<number | null>(null);

  const { matrices, colors } = useMemo(() => {
    const mats: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    const temp = new THREE.Matrix4();

    for (const point of points) {
      temp.identity();
      temp.setPosition(point.x, point.y, point.z);
      temp.scale(new THREE.Vector3(BASE_SCALE, BASE_SCALE, BASE_SCALE));
      mats.push(temp.clone());
      cols.push(getColor(point.timestamp, minTime, maxTime));
    }

    return { matrices: mats, colors: cols };
  }, [points, minTime, maxTime]);

  // Apply instance matrices and colors
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || matrices.length === 0) return;

    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i]);
      mesh.setColorAt(i, colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices, colors]);

  // Highlight hovered sphere (scale up) and restore previous
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const temp = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();

    // Restore previous hovered instance to base scale
    if (prevHoveredIndex.current !== null && prevHoveredIndex.current < matrices.length) {
      mesh.setMatrixAt(prevHoveredIndex.current, matrices[prevHoveredIndex.current]);
    }

    // Scale up newly hovered instance
    if (hoveredIndex !== null && hoveredIndex < matrices.length) {
      temp.copy(matrices[hoveredIndex]);
      temp.decompose(pos, quat, scl);
      temp.compose(pos, quat, new THREE.Vector3(HOVER_SCALE, HOVER_SCALE, HOVER_SCALE));
      mesh.setMatrixAt(hoveredIndex, temp);
    }

    mesh.instanceMatrix.needsUpdate = true;
    prevHoveredIndex.current = hoveredIndex;
  }, [hoveredIndex, matrices]);

  // Gentle rotation on the group (so tooltip rotates in sync)
  useFrame((_state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.02;
    }
  });

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    const now = performance.now();
    if (now - lastPointerMoveTime.current < 50) return; // throttle 50ms
    lastPointerMoveTime.current = now;

    if (e.instanceId !== undefined) {
      setHoveredIndex(e.instanceId);
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  if (points.length === 0) return null;

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;
  const hoveredMeta = hoveredPoint ? metadataMap.get(hoveredPoint.id) : null;

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, points.length]}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial
          transparent
          opacity={0.85}
          roughness={0.4}
          metalness={0.1}
          emissive="#6644aa"
          emissiveIntensity={0.3}
        />
      </instancedMesh>

      {hoveredPoint && hoveredMeta && (
        <Html
          position={[hoveredPoint.x, hoveredPoint.y + 0.4, hoveredPoint.z]}
          center
          distanceFactor={10}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: 'rgba(15, 15, 25, 0.92)',
            border: '1px solid rgba(120, 100, 200, 0.4)',
            borderRadius: 8,
            padding: '8px 12px',
            minWidth: 180,
            maxWidth: 260,
            color: '#e0e0e0',
            fontSize: 11,
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            lineHeight: 1.4,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}>
            <div style={{ color: '#a0a0c0', fontSize: 10, marginBottom: 4 }}>
              {formatTooltipTime(hoveredMeta.timestamp)}
            </div>
            <div style={{ marginBottom: 6 }}>
              {truncate(hoveredMeta.transcription || hoveredMeta.embedText, 140)}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {hoveredMeta.hasScreenshot && (
                <span style={{
                  background: 'rgba(100, 140, 255, 0.2)',
                  color: '#8cacff',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontSize: 9,
                }}>screenshot</span>
              )}
              {hoveredMeta.hasFocusRegions && (
                <span style={{
                  background: 'rgba(140, 100, 255, 0.2)',
                  color: '#b08cff',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontSize: 9,
                }}>focus</span>
              )}
              <span style={{
                background: 'rgba(255, 180, 100, 0.15)',
                color: '#d4a574',
                borderRadius: 4,
                padding: '1px 6px',
                fontSize: 9,
              }}>{hoveredMeta.connectionState}</span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
};

export default MindPalace3DScene;
