import React, { useEffect, useRef, useState } from 'react';
import { Settings, Key, ExternalLink, X, Eye, EyeOff, Check } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  currentKey: string;
  initialError?: string;
  onSave: (key: string) => void;
  onClose: () => void;
  isFirstRun: boolean;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  currentKey,
  initialError = '',
  onSave,
  onClose,
  isFirstRun,
}) => {
  const [inputKey, setInputKey] = useState(currentKey);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setInputKey(currentKey);
    setError(initialError);
  }, [currentKey, initialError, isOpen]);

  // Reset position when modal closes/reopens
  useEffect(() => { if (!isOpen) setPos(null); }, [isOpen]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = modalRef.current?.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos?.x ?? (rect?.left ?? 0),
      origY: pos?.y ?? (rect?.top ?? 0),
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPos({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    });
  };

  const handlePointerUp = () => { dragRef.current = null; };

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = inputKey.trim();
    if (!trimmed) {
      setError('API key is required');
      return;
    }
    if (trimmed.length < 20) {
      setError('That doesn\'t look like a valid API key');
      return;
    }
    setError('');
    onSave(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape' && !isFirstRun) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100]"
      style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(12px)' }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden"
        style={{
          background: 'rgba(14, 14, 22, 0.95)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 60px rgba(0, 120, 255, 0.08)',
          position: 'absolute',
          ...(pos
            ? { left: pos.x, top: pos.y }
            : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }),
        }}
      >
        {/* Header — drag handle */}
        <div
          className="flex items-center justify-between p-6 pb-0 cursor-move select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="flex items-center space-x-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(0, 150, 255, 0.12)', border: '1px solid rgba(0, 150, 255, 0.2)' }}
            >
              <Settings size={20} style={{ color: 'rgba(0, 180, 255, 0.9)' }} />
            </div>
            <div>
              <h2 className="text-white text-lg font-semibold tracking-tight">
                {isFirstRun ? 'Welcome to Tana' : 'Settings'}
              </h2>
              <p className="text-white/40 text-xs">
                {isFirstRun ? 'Set up your AI connection' : 'Manage your configuration'}
              </p>
            </div>
          </div>
          {!isFirstRun && (
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* API Key Input */}
          <div className="space-y-2">
            {error && (
              <div
                className="rounded-xl px-4 py-3 text-sm text-red-200"
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              >
                {error}
              </div>
            )}
            <label className="flex items-center space-x-2 text-white/50 text-xs font-medium uppercase tracking-wider">
              <Key size={12} />
              <span>Gemini API Key</span>
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={inputKey}
                onChange={(e) => { setInputKey(e.target.value); setError(''); }}
                onKeyDown={handleKeyDown}
                placeholder="AIza..."
                autoFocus
                className="w-full rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-white/20 outline-none transition-all"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: error
                    ? '1px solid rgba(239, 68, 68, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                }}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Help text */}
          <div
            className="rounded-xl p-4 space-y-2"
            style={{ background: 'rgba(0, 120, 255, 0.06)', border: '1px solid rgba(0, 120, 255, 0.1)' }}
          >
            <p className="text-white/50 text-xs leading-relaxed">
              Tana uses the Gemini Live API for real-time voice conversation. Your API key is stored
              locally on this device and is never sent anywhere except directly to Google's API.
            </p>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 text-xs font-medium transition-colors"
              style={{ color: 'rgba(0, 180, 255, 0.8)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(0, 200, 255, 1)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(0, 180, 255, 0.8)')}
            >
              <span>Get a free API key from Google AI Studio</span>
              <ExternalLink size={11} />
            </a>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!inputKey.trim()}
            className="w-full rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
            style={{
              background: inputKey.trim()
                ? 'linear-gradient(135deg, rgba(0, 150, 255, 0.9), rgba(0, 100, 255, 0.9))'
                : 'rgba(255, 255, 255, 0.05)',
              color: inputKey.trim() ? '#fff' : 'rgba(255, 255, 255, 0.3)',
              boxShadow: inputKey.trim()
                ? '0 4px 20px rgba(0, 120, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                : 'none',
            }}
          >
            <Check size={16} />
            <span>{isFirstRun ? 'Get Started' : 'Save'}</span>
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5">
          <p className="text-center text-white/20 text-[10px] tracking-wide">
            Your key stays on this device. Tana v0.1.0
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
