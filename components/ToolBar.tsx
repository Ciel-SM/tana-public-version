import React from 'react';
import { MousePointer, Scan, Crosshair, PenTool } from 'lucide-react';
import { ToolType } from '../types';
import { ToolDefinition } from '../hooks/use-tool-state';

interface ToolBarProps {
  activeTool: ToolType;
  tools: ToolDefinition[];
  onToolChange: (tool: ToolType) => void;
}

const ICON_MAP: Record<string, React.FC<{ size?: number }>> = {
  'mouse-pointer': MousePointer,
  'scan': Scan,
  'crosshair': Crosshair,
  'pen-tool': PenTool,
};

const ToolBar: React.FC<ToolBarProps> = ({ activeTool, tools, onToolChange }) => {
  return (
    <div
      className="flex items-center space-x-1 rounded-full px-1.5 py-1.5 border border-white/10"
      style={{
        background: 'rgba(18, 18, 24, 0.8)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {tools.map(tool => {
        const isActive = activeTool === tool.id;
        const Icon = ICON_MAP[tool.icon];

        return (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            title={`${tool.label} (${tool.shortcut})`}
            className="relative h-9 w-9 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90"
            style={
              isActive
                ? {
                    background: 'rgba(255, 255, 255, 0.12)',
                    color: '#FFFFFF',
                    boxShadow: '0 0 12px rgba(0, 150, 255, 0.3), inset 0 0 8px rgba(0, 150, 255, 0.1)',
                  }
                : {
                    background: 'transparent',
                    color: 'rgba(255, 255, 255, 0.4)',
                  }
            }
            onMouseEnter={e => {
              if (!isActive) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)';
            }}
            onMouseLeave={e => {
              if (!isActive) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)';
            }}
          >
            {Icon && <Icon size={16} />}
            {/* Active indicator dot */}
            {isActive && (
              <div
                className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                style={{ background: 'rgba(0, 180, 255, 0.9)', boxShadow: '0 0 4px rgba(0, 180, 255, 0.6)' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default ToolBar;
