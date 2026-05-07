import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Mic, MicOff, Power, Square, ChevronUp, ChevronDown, MessageSquare, Brain, Settings } from 'lucide-react';
import { ConnectionState, Message, ToolType, Suggestion } from '../types';
import { ToolDefinition } from '../hooks/use-tool-state';
import ToolBar from './ToolBar';
import SuggestionChips from './SuggestionChips';

interface ControlHUDProps {
  connectionState: ConnectionState;
  isMicOn: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleMic: () => void;
  messages: Message[];
  // Tooling
  activeTool: ToolType;
  tools: ToolDefinition[];
  onToolChange: (tool: ToolType) => void;
  // Suggestions
  suggestions: Suggestion[];
  suggestionsVisible: boolean;
  onSuggestionSelect: (text: string) => void;
  onHoverChange?: (isHovering: boolean) => void;
  onMindPalaceToggle?: () => void;
  mindPalaceEnabled?: boolean;
  onSettingsOpen?: () => void;
  isOverlayActive?: boolean;
}

const BAR_HEIGHTS = [12, 20, 8, 28, 14, 22, 10, 18, 26, 8, 16];
const TRANSCRIPT_TOP_MARGIN = 0;
const TRANSCRIPT_SIDE_MARGIN = 12;
const TRANSCRIPT_BOTTOM_MARGIN = 12;

const ControlHUD: React.FC<ControlHUDProps> = ({
  connectionState, isMicOn, onConnect, onDisconnect, onToggleMic, messages,
  activeTool, tools, onToolChange,
  suggestions, suggestionsVisible, onSuggestionSelect, onHoverChange,
  onMindPalaceToggle, mindPalaceEnabled, onSettingsOpen, isOverlayActive,
}) => {
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';
  const scrollRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const transcriptHeaderRef = useRef<HTMLDivElement>(null);
  const transcriptOffsetRef = useRef({ x: 0, y: 0 });
  const dragStateRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const lastExpandedTranscriptHeightRef = useRef(0);
  const [isTranscriptVisible, setIsTranscriptVisible] = useState(true);
  const [transcriptOffset, setTranscriptOffset] = useState({ x: 0, y: 0 });
  const [isDraggingTranscript, setIsDraggingTranscript] = useState(false);
  const [hasDraggedTranscript, setHasDraggedTranscript] = useState(false);

  useEffect(() => {
    if (scrollRef.current && isTranscriptVisible) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTranscriptVisible]);

  useEffect(() => {
    transcriptOffsetRef.current = transcriptOffset;
  }, [transcriptOffset]);

  useEffect(() => {
    if (isConnected) return;
    dragStateRef.current = null;
    lastExpandedTranscriptHeightRef.current = 0;
    setIsDraggingTranscript(false);
    setHasDraggedTranscript(false);
    setTranscriptOffset({ x: 0, y: 0 });
  }, [isConnected]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      const transcript = transcriptRef.current;
      if (!dragState || !transcript) return;
      if (event.pointerId !== dragState.pointerId) return;

      const rawDeltaX = event.clientX - dragState.x;
      const rawDeltaY = event.clientY - dragState.y;
      const rect = transcript.getBoundingClientRect();

      let deltaX = rawDeltaX;
      let deltaY = rawDeltaY;

      if (rect.left + deltaX < TRANSCRIPT_SIDE_MARGIN) {
        deltaX = TRANSCRIPT_SIDE_MARGIN - rect.left;
      } else if (rect.right + deltaX > window.innerWidth - TRANSCRIPT_SIDE_MARGIN) {
        deltaX = window.innerWidth - TRANSCRIPT_SIDE_MARGIN - rect.right;
      }

      if (rect.top + deltaY < TRANSCRIPT_TOP_MARGIN) {
        deltaY = TRANSCRIPT_TOP_MARGIN - rect.top;
      } else if (rect.bottom + deltaY > window.innerHeight - TRANSCRIPT_BOTTOM_MARGIN) {
        deltaY = window.innerHeight - TRANSCRIPT_BOTTOM_MARGIN - rect.bottom;
      }

      dragStateRef.current = {
        pointerId: dragState.pointerId,
        x: event.clientX,
        y: event.clientY,
      };

      if (deltaX === 0 && deltaY === 0) return;

      if (!hasDraggedTranscript) {
        setHasDraggedTranscript(true);
      }

      const nextOffset = {
        x: transcriptOffsetRef.current.x + deltaX,
        y: transcriptOffsetRef.current.y + deltaY,
      };

      transcriptOffsetRef.current = nextOffset;
      setTranscriptOffset(nextOffset);
    };

    const stopDragging = (event: PointerEvent) => {
      if (!dragStateRef.current) return;
      if (event.pointerId !== dragStateRef.current.pointerId) return;
      dragStateRef.current = null;
      setIsDraggingTranscript(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isConnected || !isTranscriptVisible || messages.length === 0) return;

    const transcript = transcriptRef.current;
    if (!transcript) return;

    const rect = transcript.getBoundingClientRect();
    if (rect.top >= TRANSCRIPT_TOP_MARGIN) return;

    const nextOffset = {
      x: transcriptOffsetRef.current.x,
      y: transcriptOffsetRef.current.y + (TRANSCRIPT_TOP_MARGIN - rect.top),
    };

    transcriptOffsetRef.current = nextOffset;
    setTranscriptOffset((currentOffset) => {
      if (currentOffset.x === nextOffset.x && currentOffset.y === nextOffset.y) {
        return currentOffset;
      }

      return nextOffset;
    });
  }, [isConnected, isTranscriptVisible, messages]);

  useLayoutEffect(() => {
    if (!isConnected || !isTranscriptVisible || messages.length === 0) return;

    const transcript = transcriptRef.current;
    if (!transcript) return;

    lastExpandedTranscriptHeightRef.current = transcript.getBoundingClientRect().height;
  }, [isConnected, isTranscriptVisible, messages]);

  const handleTranscriptPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isConnected || messages.length === 0) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setIsDraggingTranscript(true);
  };

  const handleTranscriptToggle = () => {
    const transcript = transcriptRef.current;
    const header = transcriptHeaderRef.current;

    if (!hasDraggedTranscript || !transcript || !header) {
      setIsTranscriptVisible((visible) => !visible);
      return;
    }

    const transcriptHeight = transcript.getBoundingClientRect().height;
    const headerHeight = header.getBoundingClientRect().height;

    if (isTranscriptVisible) {
      const heightDelta = Math.max(0, transcriptHeight - headerHeight);
      if (heightDelta > 0) {
        const nextOffset = {
          x: transcriptOffsetRef.current.x,
          y: transcriptOffsetRef.current.y - heightDelta,
        };
        transcriptOffsetRef.current = nextOffset;
        setTranscriptOffset(nextOffset);
      }
      lastExpandedTranscriptHeightRef.current = transcriptHeight;
      setIsTranscriptVisible(false);
      return;
    }

    const heightDelta = Math.max(0, lastExpandedTranscriptHeightRef.current - headerHeight);
    if (heightDelta > 0) {
      const nextOffset = {
        x: transcriptOffsetRef.current.x,
        y: transcriptOffsetRef.current.y + heightDelta,
      };
      transcriptOffsetRef.current = nextOffset;
      setTranscriptOffset(nextOffset);
    }
    setIsTranscriptVisible(true);
  };

  return (
    <div
      className="fixed bottom-8 left-1/2 transform -translate-x-1/2 w-[90%] max-w-2xl z-50 flex flex-col items-center"
      onMouseEnter={() => {
        onHoverChange?.(true);
        const tana = (window as any).tana;
        if (tana?.setIgnoreMouseEvents) tana.setIgnoreMouseEvents(false);
      }}
      onMouseLeave={() => {
        onHoverChange?.(false);
        const tana = (window as any).tana;
        if (!tana?.setIgnoreMouseEvents) return;
        // Restore passthrough unless actively drawing (drawing tools need mouse capture)
        if (!isConnected || activeTool === 'cursor') {
          if (!isOverlayActive) {
            tana.setIgnoreMouseEvents(true, { forward: true });
          }
        }
      }}
    >

      {/* ── Transcript ─────────────────────────────────────────────────────── */}
      {messages.length > 0 && isConnected && (
        <div
          ref={transcriptRef}
          data-testid="transcript-panel"
          className="mb-3 w-full max-w-xl flex flex-col"
          style={{ transform: `translate(${transcriptOffset.x}px, ${transcriptOffset.y}px)` }}
        >
          <div
            ref={transcriptHeaderRef}
            data-testid="transcript-drag-handle"
            className={`flex justify-between items-center px-4 py-2.5 rounded-t-2xl border-t border-x border-white/8 select-none ${isDraggingTranscript ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ background: 'rgba(15, 15, 20, 0.75)', backdropFilter: 'blur(20px)', touchAction: 'none' }}
            onPointerDown={handleTranscriptPointerDown}
            onDragStart={(event) => event.preventDefault()}
            title="Drag to move transcript"
          >
            <div className="flex items-center space-x-2">
              <MessageSquare size={13} className="text-white/40" />
              <span className="text-[10px] font-semibold text-white/40 tracking-[0.15em]">TRANSCRIPT</span>
            </div>
            <button
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleTranscriptToggle}
              className="p-1 hover:bg-white/10 rounded-full text-white/40 hover:text-white/70 transition-all"
            >
              {isTranscriptVisible ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
          </div>
          {isTranscriptVisible && (
            <div
              ref={scrollRef}
              className="border-b border-x border-white/8 rounded-b-2xl p-4 max-h-64 overflow-y-auto scrollbar-hide flex flex-col space-y-3"
              style={{ background: 'rgba(10, 10, 16, 0.82)', backdropFilter: 'blur(24px)' }}
            >
              {messages.map((msg, i) => {
                if (msg.role === 'system') {
                  return (
                    <p key={msg.id + i} className="text-center text-[10px] text-white/25 tracking-wide">{msg.text}</p>
                  );
                }
                return (
                  <div key={msg.id + i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] text-white/30 uppercase tracking-wider mb-1 px-1">
                      {msg.role === 'user' ? 'You' : 'Tana'}
                    </span>
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm max-w-[85%] leading-relaxed ${
                        msg.role === 'user' ? 'bg-white/10 text-white/90' : 'text-blue-100/90 border border-blue-400/15'
                      }`}
                      style={msg.role === 'model' ? { background: 'rgba(30, 80, 200, 0.15)' } : undefined}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Suggestion Chips ───────────────────────────────────────────────── */}
      {isConnected && (
        <SuggestionChips
          suggestions={suggestions}
          visible={suggestionsVisible}
          onSelect={onSuggestionSelect}
        />
      )}

      {/* ── Toolbar + Control Bar row ──────────────────────────────────────── */}
      <div className="flex items-center space-x-3 w-full">
        {/* Tool switcher (visible when connected) */}
        {isConnected && (
          <ToolBar activeTool={activeTool} tools={tools} onToolChange={onToolChange} />
        )}

        {/* Main Control Bar */}
        <div
          className="flex-1 border border-white/10 rounded-full p-2 shadow-2xl flex items-center justify-between px-6 h-20 transition-all"
          style={{
            background: 'rgba(18, 18, 24, 0.85)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* Left — Status + Settings */}
          <div className="flex items-center space-x-3 w-1/3">
            <div
              className={`h-2.5 w-2.5 rounded-full flex-shrink-0 transition-all duration-500 ${isConnected ? 'bg-emerald-400' : connectionState === 'error' ? 'bg-red-400' : 'bg-white/20'}`}
              style={isConnected ? { boxShadow: '0 0 8px rgba(52, 211, 153, 0.8)' } : connectionState === 'error' ? { boxShadow: '0 0 8px rgba(248, 113, 113, 0.8)' } : undefined}
            />
            <span className="text-white/50 text-xs font-medium tracking-wide whitespace-nowrap hidden sm:inline">
              {connectionState === 'error' ? 'Check API key' : connectionState === 'connecting' ? 'Connecting…' : isConnected ? 'Active' : 'Standby'}
            </span>
            {onSettingsOpen && (
              <button
                onClick={onSettingsOpen}
                className="p-2 rounded-lg hover:bg-white/10 transition-all"
                title="Settings"
              >
                <Settings size={16} className="text-white/30" />
              </button>
            )}
          </div>

          {/* Center — Actions */}
          <div className="flex items-center justify-center space-x-4 w-1/3">
            {!isConnected ? (
              <button
                onClick={onConnect}
                disabled={isConnecting}
                className="h-12 w-12 rounded-full flex items-center justify-center transition-all"
                style={
                  isConnecting
                    ? {
                        background: 'rgba(255,255,255,0.18)',
                        color: 'rgba(0,0,0,0.5)',
                        boxShadow: 'none',
                        cursor: 'not-allowed',
                        opacity: 0.8,
                      }
                    : {
                        background: '#FFF',
                        color: '#000',
                        boxShadow: '0 0 20px rgba(255,255,255,0.3)',
                      }
                }
              >
                <Power size={20} strokeWidth={2.5} />
              </button>
            ) : (
              <>
                <button
                  onClick={onToggleMic}
                  className="h-14 w-14 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95"
                  style={
                    isMicOn
                      ? { background: '#FFF', color: '#000', boxShadow: '0 0 0 4px rgba(255,255,255,0.12), 0 0 24px rgba(255,255,255,0.4), 0 0 60px rgba(0,120,255,0.25)' }
                      : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }
                  }
                >
                  {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
                </button>
                <button
                  onClick={onDisconnect}
                  className="h-11 w-11 rounded-full flex items-center justify-center transition-all active:scale-95"
                  style={{ background: 'rgba(239,68,68,0.12)', color: 'rgb(239,68,68)', border: '1px solid rgba(239,68,68,0.2)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.22)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)'; }}
                >
                  <Square size={18} fill="currentColor" />
                </button>
              </>
            )}
          </div>

          {/* Right — Live waveform + Mind Palace */}
          <div className="flex items-center justify-end w-1/3 space-x-3">
            {isConnected && (
              <div className="flex items-center space-x-2">
                <div className="flex items-end space-x-[2px] h-6">
                  {BAR_HEIGHTS.map((h, i) => (
                    <div
                      key={i}
                      className="w-[3px] rounded-full"
                      style={{
                        height: isMicOn ? `${h}px` : '4px',
                        background: isMicOn ? `hsl(${200 + i * 8}, 80%, 65%)` : 'rgba(255,255,255,0.15)',
                        transition: 'height 0.15s ease, background 0.3s ease',
                        animation: isMicOn ? `barPulse ${400 + i * 60}ms ease-in-out infinite alternate` : 'none',
                        animationDelay: `${i * 40}ms`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-[10px] font-mono tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>LIVE</span>
              </div>
            )}
            {onMindPalaceToggle && (
              <button
                onClick={onMindPalaceToggle}
                className="p-2 rounded-lg hover:bg-white/10 transition-all relative"
                title="Mind Palace (⌘M)"
              >
                <Brain size={16} className={mindPalaceEnabled ? 'text-purple-400' : 'text-white/30'} />
                {mindPalaceEnabled && (
                  <div
                    className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-red-400"
                    style={{ boxShadow: '0 0 4px rgba(248, 113, 113, 0.8)' }}
                  />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Helper text */}
      <div className="text-center mt-3 opacity-30 hover:opacity-70 transition-opacity duration-300">
        <p className="text-[10px] text-white uppercase tracking-[0.2em] font-medium">
          {isConnected
            ? activeTool === 'free-draw'
              ? '` Cursor  ·  1 Focus  ·  2 Laser  ·  3 Draw  ·  ⌘Z Undo  ·  Click stroke to delete'
              : '` Cursor  ·  1 Focus  ·  2 Laser  ·  3 Draw  ·  Right-click Delete'
            : 'Click power to start'}
        </p>
      </div>
    </div>
  );
};

export default ControlHUD;
