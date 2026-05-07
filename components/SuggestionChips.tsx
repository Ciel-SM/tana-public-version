import React from 'react';
import { Suggestion } from '../types';

interface SuggestionChipsProps {
  suggestions: Suggestion[];
  visible: boolean;
  onSelect: (text: string) => void;
}

const SuggestionChips: React.FC<SuggestionChipsProps> = ({ suggestions, visible, onSelect }) => {
  if (!visible || suggestions.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-2 justify-center mb-3 transition-all duration-300"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
      }}
    >
      {suggestions.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s.text)}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 active:scale-95 border"
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            color: 'rgba(255, 255, 255, 0.65)',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(12px)',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget;
            el.style.background = 'rgba(0, 150, 255, 0.15)';
            el.style.borderColor = 'rgba(0, 150, 255, 0.3)';
            el.style.color = 'rgba(255, 255, 255, 0.9)';
            el.style.boxShadow = '0 0 12px rgba(0, 150, 255, 0.2)';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget;
            el.style.background = 'rgba(255, 255, 255, 0.06)';
            el.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            el.style.color = 'rgba(255, 255, 255, 0.65)';
            el.style.boxShadow = 'none';
          }}
        >
          {s.text}
        </button>
      ))}
    </div>
  );
};

export default SuggestionChips;
