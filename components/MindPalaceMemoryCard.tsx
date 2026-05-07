import React, { useEffect, useState } from 'react';
import { Image, FileText } from 'lucide-react';
import type { SearchResult } from '../lib/mind-palace/types';

interface MindPalaceMemoryCardProps {
  result: SearchResult;
  thumbnailCache: Map<string, string>;
  onLoadThumbnail: (path: string) => Promise<string | null>;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return time;

  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr} ${time}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '...';
}

const MindPalaceMemoryCard: React.FC<MindPalaceMemoryCardProps> = ({
  result,
  thumbnailCache,
  onLoadThumbnail,
}) => {
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);

  useEffect(() => {
    if (result.screenshotPath && !thumbnailCache.has(result.screenshotPath)) {
      onLoadThumbnail(result.screenshotPath).then(() => setThumbnailLoaded(true));
    }
  }, [result.screenshotPath, thumbnailCache, onLoadThumbnail]);

  const thumbnail = result.screenshotPath ? thumbnailCache.get(result.screenshotPath) : null;
  const similarityPct = Math.round(result.similarity * 100);

  return (
    <div
      className="rounded-xl border border-white/8 hover:border-white/15 transition-all cursor-pointer p-3"
      style={{ background: 'rgba(255, 255, 255, 0.02)' }}
    >
      <div className="flex space-x-3">
        {/* Thumbnail or icon */}
        <div
          className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden flex items-center justify-center"
          style={{ background: 'rgba(255, 255, 255, 0.05)' }}
        >
          {thumbnail ? (
            <img
              src={`data:image/jpeg;base64,${thumbnail}`}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : result.screenshotPath ? (
            <Image size={16} className="text-white/20" />
          ) : (
            <FileText size={16} className="text-white/20" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-white/40">{formatTime(result.timestamp)}</span>
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{
                background: similarityPct >= 90
                  ? 'rgba(52, 211, 153, 0.15)'
                  : similarityPct >= 75
                  ? 'rgba(251, 191, 36, 0.15)'
                  : 'rgba(255, 255, 255, 0.05)',
                color: similarityPct >= 90
                  ? 'rgba(52, 211, 153, 0.9)'
                  : similarityPct >= 75
                  ? 'rgba(251, 191, 36, 0.9)'
                  : 'rgba(255, 255, 255, 0.4)',
              }}
            >
              {similarityPct}%
            </span>
          </div>
          <p className="text-xs text-white/70 leading-relaxed">
            {result.transcription
              ? truncate(result.transcription, 120)
              : truncate(result.embedText, 120)}
          </p>
          {result.focusRegions.length > 0 && (
            <p className="text-[10px] text-white/25 mt-1">
              {result.focusRegions.length} focus region{result.focusRegions.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MindPalaceMemoryCard;
