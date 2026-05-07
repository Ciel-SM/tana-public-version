import React from 'react';
import { X, Brain } from 'lucide-react';
import MindPalaceSearchBar from './MindPalaceSearchBar';
import MindPalaceMemoryCard from './MindPalaceMemoryCard';
import MindPalaceStatsPanel from './MindPalaceStatsPanel';
import type { SearchResult, MindPalaceStats } from '../lib/mind-palace/types';

interface MindPalaceSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  query: string;
  onQueryChange: (q: string) => void;
  results: SearchResult[];
  isSearching: boolean;
  stats: MindPalaceStats | null;
  pendingEmbeds: number;
  thumbnailCache: Map<string, string>;
  onLoadThumbnail: (path: string) => Promise<string | null>;
  onOpen3DView: () => void;
}

const MindPalaceSidebar: React.FC<MindPalaceSidebarProps> = ({
  isOpen,
  onClose,
  enabled,
  onToggleEnabled,
  query,
  onQueryChange,
  results,
  isSearching,
  stats,
  pendingEmbeds,
  thumbnailCache,
  onLoadThumbnail,
  onOpen3DView,
}) => {
  return (
    <div
      className="fixed top-0 right-0 h-full z-[60] transition-transform duration-300 ease-in-out"
      style={{
        width: 380,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
      onMouseEnter={() => {
        const tana = (window as any).tana;
        tana?.setIgnoreMouseEvents?.(false);
      }}
      onMouseLeave={() => {
        const tana = (window as any).tana;
        tana?.setIgnoreMouseEvents?.(true, { forward: true });
      }}
    >
      <div
        className="h-full flex flex-col border-l border-white/10"
        style={{
          background: 'rgba(12, 12, 18, 0.92)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center space-x-2.5">
            <Brain size={18} className="text-purple-400" />
            <span className="text-sm font-semibold text-white/90 tracking-wide">Mind Palace</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Recording toggle */}
        <div className="px-5 py-3 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div
                className={`h-2 w-2 rounded-full transition-all ${enabled ? 'bg-red-400' : 'bg-white/20'}`}
                style={enabled ? { boxShadow: '0 0 6px rgba(248, 113, 113, 0.8)' } : undefined}
              />
              <span className="text-xs text-white/50">
                {enabled ? 'Recording' : 'Recording OFF'}
              </span>
              {enabled && pendingEmbeds > 0 && (
                <span className="text-[10px] text-white/30">({pendingEmbeds} pending)</span>
              )}
            </div>
            <button
              onClick={() => onToggleEnabled(!enabled)}
              className={`relative w-10 h-5 rounded-full transition-all ${enabled ? 'bg-purple-500' : 'bg-white/15'}`}
            >
              <div
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
                style={{ left: enabled ? '22px' : '2px' }}
              />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 py-3">
          <MindPalaceSearchBar
            query={query}
            onChange={onQueryChange}
            isSearching={isSearching}
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 scrollbar-hide">
          {results.length > 0 ? (
            <div className="space-y-2 pb-4">
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">
                {results.length} result{results.length !== 1 ? 's' : ''}
              </p>
              {results.map(result => (
                <MindPalaceMemoryCard
                  key={result.id}
                  result={result}
                  thumbnailCache={thumbnailCache}
                  onLoadThumbnail={onLoadThumbnail}
                />
              ))}
            </div>
          ) : query.trim() && !isSearching ? (
            <p className="text-xs text-white/30 text-center mt-8">No memories found</p>
          ) : !query.trim() && stats && stats.totalMemories > 0 ? (
            <p className="text-xs text-white/30 text-center mt-8">
              Search {stats.totalMemories.toLocaleString()} memories...
            </p>
          ) : !query.trim() ? (
            <p className="text-xs text-white/30 text-center mt-8">
              {enabled ? 'Memories will appear here as you work' : 'Enable recording to start capturing memories'}
            </p>
          ) : null}
        </div>

        {/* Stats + 3D View */}
        <div className="border-t border-white/8 px-5 py-3">
          <MindPalaceStatsPanel stats={stats} />
          <button
            onClick={onOpen3DView}
            className="mt-3 w-full py-2 rounded-lg text-xs font-medium text-white/60 hover:text-white/90
              border border-white/10 hover:border-purple-400/30 hover:bg-purple-400/5 transition-all"
          >
            Open 3D View
          </button>
        </div>
      </div>
    </div>
  );
};

export default MindPalaceSidebar;
