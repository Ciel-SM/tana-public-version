import { useState, useCallback, useEffect } from 'react';
import { ToolType } from '../types';

export interface ToolDefinition {
  id: ToolType;
  label: string;
  description: string;
  cursor: string;
  shortcut: string;
  icon: string; // lucide-react icon name
}

export const TOOL_REGISTRY: Record<ToolType, ToolDefinition> = {
  'cursor': {
    id: 'cursor',
    label: 'Cursor',
    description: 'Normal cursor — interact with your desktop',
    cursor: 'default',
    shortcut: '`',
    icon: 'mouse-pointer',
  },
  'focus-box': {
    id: 'focus-box',
    label: 'Focus',
    description: 'Draw a focus area for AI analysis',
    cursor: 'crosshair',
    shortcut: '1',
    icon: 'scan',
  },
  'laser-pointer': {
    id: 'laser-pointer',
    label: 'Laser',
    description: 'Point at screen elements',
    cursor: 'none',
    shortcut: '2',
    icon: 'crosshair',
  },
  'free-draw': {
    id: 'free-draw',
    label: 'Draw',
    description: 'Annotate with freehand strokes',
    cursor: 'crosshair',
    shortcut: '3',
    icon: 'pen-tool',
  },
};

const TOOL_ORDER: ToolType[] = ['cursor', 'focus-box', 'laser-pointer', 'free-draw'];

export function useToolState() {
  const [activeTool, setActiveTool] = useState<ToolType>('cursor');

  // Keyboard shortcuts: ` for cursor, 1/2/3 for tools
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

    // Backtick or Escape returns to cursor mode
    if (e.key === '`' || e.key === 'Escape') {
      setActiveTool('cursor');
      return;
    }

    const toolKeys: Record<string, ToolType> = { '1': 'focus-box', '2': 'laser-pointer', '3': 'free-draw' };
    if (toolKeys[e.key]) {
      setActiveTool(toolKeys[e.key]);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    activeTool,
    setActiveTool,
    activeToolDef: TOOL_REGISTRY[activeTool],
    tools: TOOL_ORDER.map(id => TOOL_REGISTRY[id]),
  };
}
