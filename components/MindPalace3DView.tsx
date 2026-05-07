import React, { useCallback, useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import MindPalace3DScene from './MindPalace3DScene';
import MindPalaceTimeline from './MindPalaceTimeline';
import { projectToUMAP3D, ProjectedPoint } from '../lib/mind-palace/projection';
import type { EmbeddingRecord, MemoryMeta } from '../lib/mind-palace/types';

interface MindPalace3DViewProps {
  isOpen: boolean;
  onClose: () => void;
  initializeMindPalace?: () => Promise<void>;
}

const MindPalace3DView: React.FC<MindPalace3DViewProps> = ({
  isOpen,
  onClose,
  initializeMindPalace,
}) => {
  const [points, setPoints] = useState<ProjectedPoint[]>([]);
  const [filteredPoints, setFilteredPoints] = useState<ProjectedPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<[number, number]>([0, Date.now()]);
  const [minTime, setMinTime] = useState(0);
  const [maxTime, setMaxTime] = useState(Date.now());
  const [metadataMap, setMetadataMap] = useState<Map<string, MemoryMeta>>(new Map());

  const loadEmbeddings = useCallback(async () => {
    const tana = (window as any).tana;
    if (!tana?.mindPalace?.getAllEmbeddings) return;

    setIsLoading(true);
    try {
      await initializeMindPalace?.();
      const [records, metaArray]: [EmbeddingRecord[], MemoryMeta[]] = await Promise.all([
        tana.mindPalace.getAllEmbeddings(),
        tana.mindPalace.getAllMetadata(),
      ]);

      setMetadataMap(new Map(metaArray.map(m => [m.id, m])));

      if (records.length === 0) {
        setPoints([]);
        setIsLoading(false);
        return;
      }

      // Deserialize embeddings (they come as number[] over IPC)
      const deserialized = records.map(r => ({
        ...r,
        embedding: r.embedding instanceof Float32Array ? r.embedding : new Float32Array(r.embedding),
      }));

      const projected = projectToUMAP3D(deserialized);
      setPoints(projected);
      setFilteredPoints(projected);

      if (projected.length > 0) {
        const times = projected.map(p => p.timestamp);
        const min = Math.min(...times);
        const max = Math.max(...times);
        setMinTime(min);
        setMaxTime(max);
        setTimeRange([min, max]);
      }
    } catch (err) {
      console.error('[MindPalace] Failed to load embeddings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [initializeMindPalace]);

  useEffect(() => {
    if (isOpen) loadEmbeddings();
  }, [isOpen, loadEmbeddings]);

  // Filter by time range
  useEffect(() => {
    const [min, max] = timeRange;
    setFilteredPoints(points.filter(p => p.timestamp >= min && p.timestamp <= max));
  }, [points, timeRange]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col"
      style={{
        background: 'rgba(5, 5, 12, 0.96)',
        backdropFilter: 'blur(20px)',
      }}
      onMouseEnter={() => {
        const tana = (window as any).tana;
        tana?.setIgnoreMouseEvents?.(false);
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <h2 className="text-sm font-semibold text-white/80 tracking-wide">
          Mind Palace — 3D Memory Space
        </h2>
        <div className="flex items-center space-x-4">
          <span className="text-[10px] text-white/30">
            {filteredPoints.length} / {points.length} memories
          </span>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80 transition-all"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1 relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-purple-400/50" />
            <span className="ml-3 text-sm text-white/40">Projecting memories...</span>
          </div>
        ) : points.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-white/30">No memories to visualize</p>
          </div>
        ) : (
          <Canvas camera={{ position: [0, 0, 20], fov: 60 }}>
            <fog attach="fog" args={['#050510', 15, 50]} />
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={0.5} />
            <pointLight position={[-10, -5, -10]} intensity={0.3} />
            <gridHelper args={[40, 40, '#1a1a2e', '#0d0d1a']} />
            <MindPalace3DScene
              points={filteredPoints}
              minTime={minTime}
              maxTime={maxTime}
              metadataMap={metadataMap}
            />
            <OrbitControls
              enablePan
              enableZoom
              enableRotate
              zoomSpeed={0.8}
              rotateSpeed={0.5}
            />
          </Canvas>
        )}
      </div>

      {/* Timeline slider */}
      {points.length > 0 && (
        <MindPalaceTimeline
          minTime={minTime}
          maxTime={maxTime}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
        />
      )}
    </div>
  );
};

export default MindPalace3DView;
