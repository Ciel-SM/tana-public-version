import React from 'react';
import { Search, Loader2 } from 'lucide-react';

interface MindPalaceSearchBarProps {
  query: string;
  onChange: (q: string) => void;
  isSearching: boolean;
}

const MindPalaceSearchBar: React.FC<MindPalaceSearchBarProps> = ({
  query,
  onChange,
  isSearching,
}) => {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
        {isSearching ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Search size={14} />
        )}
      </div>
      <input
        type="text"
        value={query}
        onChange={e => onChange(e.target.value)}
        placeholder="Search memories..."
        className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm text-white/90 placeholder-white/25
          border border-white/10 focus:border-purple-400/40 focus:outline-none transition-all"
        style={{
          background: 'rgba(255, 255, 255, 0.04)',
        }}
      />
    </div>
  );
};

export default MindPalaceSearchBar;
