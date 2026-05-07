import React from 'react';
import type { MindPalaceStats } from '../lib/mind-palace/types';

interface MindPalaceStatsPanelProps {
  stats: MindPalaceStats | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const MindPalaceStatsPanel: React.FC<MindPalaceStatsPanelProps> = ({ stats }) => {
  if (!stats || stats.totalMemories === 0) {
    return (
      <p className="text-[10px] text-white/25 text-center">No memories yet</p>
    );
  }

  const totalStorage = stats.storageBytesDb + stats.storageBytesImages;

  return (
    <div className="flex items-center justify-center space-x-3 text-[10px] text-white/35">
      <span>{stats.totalMemories.toLocaleString()} memories</span>
      <span className="text-white/15">·</span>
      <span>{formatBytes(totalStorage)}</span>
    </div>
  );
};

export default MindPalaceStatsPanel;
