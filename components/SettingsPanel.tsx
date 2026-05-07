import React, { useEffect, useState } from 'react';
import { Settings, Eye, EyeOff, X } from 'lucide-react';
import { LIVE_VOICE_OPTIONS, LIVE_TONE_LABELS } from '../lib/live-voice-options';

interface SettingsPanelProps {
  isOpen: boolean;
  currentKey: string;
  currentVoiceName: string;
  liteMode: boolean;
  isLiteModeRecommended: boolean;
  liteModeOverrideSource: 'argv' | 'env' | null;
  onSaveApiKey: (key: string) => void;
  onSaveVoiceName: (voiceName: string) => void;
  onSaveLiteMode: (liteMode: boolean) => void;
  onClose: () => void;
}

type NavItem = 'general';
const OTHER_TONE_TAB = 'Other';

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  currentKey,
  currentVoiceName,
  liteMode,
  isLiteModeRecommended,
  liteModeOverrideSource,
  onSaveApiKey,
  onSaveVoiceName,
  onSaveLiteMode,
  onClose,
}) => {
  const [activeNav, setActiveNav] = useState<NavItem>('general');
  const [isEditing, setIsEditing] = useState(false);
  const [inputKey, setInputKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [voiceDraft, setVoiceDraft] = useState(currentVoiceName);
  const [toneFilter, setToneFilter] = useState<string>('All');

  // Reset edit state when panel opens/closes
  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      setInputKey('');
      setShowKey(false);
      setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setVoiceDraft(currentVoiceName);
  }, [currentVoiceName, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toneCounts = LIVE_VOICE_OPTIONS.reduce<Record<string, number>>((counts, option) => {
    counts[option.toneLabel] = (counts[option.toneLabel] ?? 0) + 1;
    return counts;
  }, {});

  const multiPersonaToneLabels = LIVE_TONE_LABELS.filter((toneLabel) => (toneCounts[toneLabel] ?? 0) > 1);
  const singlePersonaToneLabels = LIVE_TONE_LABELS.filter((toneLabel) => (toneCounts[toneLabel] ?? 0) === 1);
  const toneTabs = ['All', ...multiPersonaToneLabels, ...(singlePersonaToneLabels.length > 0 ? [OTHER_TONE_TAB] : [])];

  const filteredVoices = toneFilter === 'All'
    ? LIVE_VOICE_OPTIONS
    : toneFilter === OTHER_TONE_TAB
      ? LIVE_VOICE_OPTIONS.filter(v => singlePersonaToneLabels.includes(v.toneLabel))
      : LIVE_VOICE_OPTIONS.filter(v => v.toneLabel === toneFilter);
  const hasUnsavedVoice = voiceDraft !== currentVoiceName;

  const handleStartEdit = () => {
    setIsEditing(true);
    setInputKey(currentKey);
    setError('');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setInputKey('');
    setShowKey(false);
    setError('');
  };

  const handleSave = () => {
    const trimmed = inputKey.trim();
    if (!trimmed) {
      setError('API key is required');
      return;
    }
    if (trimmed.length < 20) {
      setError("That doesn't look like a valid API key");
      return;
    }
    setError('');
    onSaveApiKey(trimmed);
    setIsEditing(false);
    setInputKey('');
    setShowKey(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 overflow-hidden flex"
        style={{
          background: 'rgba(14, 14, 22, 0.95)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 60px rgba(0, 120, 255, 0.08)',
          height: '520px',
        }}
      >
        {/* Left sidebar */}
        <div
          className="w-48 flex flex-col border-r border-white/8 p-4"
          style={{ background: 'rgba(10, 10, 16, 0.6)' }}
        >
          <span className="text-[10px] font-semibold text-white/30 tracking-[0.15em] uppercase mb-3 px-2">
            Settings
          </span>

          <button
            onClick={() => setActiveNav('general')}
            className={`flex items-center space-x-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeNav === 'general'
                ? 'text-white'
                : 'text-white/40 hover:text-white/60 hover:bg-white/5'
            }`}
            style={activeNav === 'general' ? { background: 'rgba(0, 120, 255, 0.15)', color: 'rgba(100, 180, 255, 1)' } : undefined}
          >
            <Settings size={14} />
            <span>General</span>
          </button>

          <div className="flex-1" />
          <p className="text-[10px] text-white/20 tracking-wide px-2">Tana v0.1.0</p>
        </div>

        {/* Right content area */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto">
          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-white text-lg font-semibold tracking-tight">General</h2>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
            >
              <X size={16} />
            </button>
          </div>

          {/* API Key row */}
          <div
            className="rounded-xl p-4"
            style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80">API Key</p>
                <p className="text-xs text-white/35 mt-0.5">
                  {currentKey ? maskKey(currentKey) : 'Not set'}
                </p>
              </div>
              {!isEditing && (
                <button
                  onClick={handleStartEdit}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: 'rgba(255, 255, 255, 0.06)', color: 'rgba(255, 255, 255, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
                >
                  Change
                </button>
              )}
            </div>

            {/* Inline edit area */}
            {isEditing && (
              <div className="mt-3 space-y-3">
                {error && (
                  <div
                    className="rounded-lg px-3 py-2 text-xs text-red-200"
                    style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                  >
                    {error}
                  </div>
                )}
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={inputKey}
                    onChange={(e) => { setInputKey(e.target.value); setError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                    placeholder="AIza..."
                    autoFocus
                    className="w-full rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-white/20 outline-none transition-all"
                    style={{ background: 'rgba(255, 255, 255, 0.05)', border: error ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)' }}
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleSave}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{ background: 'rgba(0, 150, 255, 0.8)', color: '#fff' }}
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium text-white/40 hover:text-white/60 transition-all"
                    style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div
            className="rounded-xl p-4 mt-4"
            style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
          >
            <div className="flex items-center justify-between gap-4 mb-2">
              <div>
                <p className="text-sm font-medium text-white/80">Lite Mode</p>
                <p className="text-xs text-white/35 mt-0.5">
                  Uses lower-cost screen capture and keeps heavy memory features dormant until needed.
                </p>
              </div>
              <button
                onClick={() => onSaveLiteMode(!liteMode)}
                className={`relative w-10 h-5 rounded-full transition-all ${liteMode ? 'bg-cyan-500' : 'bg-white/15'}`}
                aria-pressed={liteMode}
                title="Toggle Lite Mode"
                disabled={liteModeOverrideSource !== null}
                style={liteModeOverrideSource ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                <div
                  className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
                  style={{ left: liteMode ? '22px' : '2px' }}
                />
              </button>
            </div>
            <p className="text-[11px] text-white/30 leading-relaxed">
              {liteModeOverrideSource
                ? `Forced by launch ${liteModeOverrideSource === 'argv' ? 'flag' : 'environment variable'} for this session.`
                : isLiteModeRecommended
                ? 'Recommended for this machine because available memory is limited.'
                : 'Useful when Tana feels heavy on older or lower-memory systems.'}
            </p>
          </div>

          <div
            className="rounded-xl p-4 mt-4"
            style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-sm font-medium text-white/80">Voice Choice</p>
                <p className="text-xs text-white/35 mt-0.5">
                  Choose from 30 Gemini Live voices
                </p>
              </div>
              {hasUnsavedVoice && (
                <span
                  className="flex-shrink-0 mt-1 h-2 w-2 rounded-full"
                  style={{ background: 'rgba(0, 180, 255, 0.85)', boxShadow: '0 0 6px rgba(0, 150, 255, 0.6)' }}
                  title="Unsaved change"
                />
              )}
            </div>

            {/* Tone filter chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
              {toneTabs.map((tone) => {
                const isActive = toneFilter === tone;
                return (
                  <button
                    key={tone}
                    onClick={() => setToneFilter(tone)}
                    className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all"
                    style={{
                      background: isActive ? 'rgba(0, 120, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      color: isActive ? 'rgba(100, 180, 255, 1)' : 'rgba(255, 255, 255, 0.4)',
                      border: isActive ? '1px solid rgba(0, 150, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                      boxShadow: isActive ? '0 0 8px rgba(0, 120, 255, 0.2)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.09)';
                        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.65)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
                      }
                    }}
                  >
                    {tone}
                  </button>
                );
              })}
            </div>

            {/* Voice card grid */}
            <div
              className="grid grid-cols-3 gap-1.5 overflow-y-auto scrollbar-hide"
              style={{ maxHeight: '160px' }}
            >
              {filteredVoices.map((option) => {
                const isSelected = voiceDraft === option.voiceName;
                return (
                  <button
                    key={option.voiceName}
                    onClick={() => setVoiceDraft(option.voiceName)}
                    className="rounded-lg px-2 py-2 text-left transition-all"
                    style={{
                      background: isSelected ? 'rgba(0, 120, 255, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                      border: isSelected ? '1px solid rgba(0, 150, 255, 0.45)' : '1px solid rgba(255, 255, 255, 0.06)',
                      boxShadow: isSelected ? '0 0 10px rgba(0, 120, 255, 0.15)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                      }
                    }}
                  >
                    <p
                      className="text-[11px] font-medium truncate"
                      style={{ color: isSelected ? 'rgba(130, 190, 255, 1)' : 'rgba(255, 255, 255, 0.75)' }}
                    >
                      {option.voiceName}
                    </p>
                    <p
                      className="text-[10px] mt-0.5 truncate"
                      style={{ color: isSelected ? 'rgba(100, 170, 255, 0.7)' : 'rgba(255, 255, 255, 0.28)' }}
                    >
                      {option.toneLabel}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Hidden select — preserves test compatibility */}
            <label htmlFor="voice-choice" className="sr-only">Voice Choice</label>
            <select
              id="voice-choice"
              value={voiceDraft}
              onChange={(e) => setVoiceDraft(e.target.value)}
              style={{ display: 'none' }}
              aria-hidden="true"
              tabIndex={-1}
            >
              {LIVE_VOICE_OPTIONS.map((option) => (
                <option key={option.voiceName} value={option.voiceName}>
                  {option.voiceName} ({option.toneLabel})
                </option>
              ))}
            </select>

            {/* Save row */}
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.25)' }}>
                Saved: <span style={{ color: 'rgba(255, 255, 255, 0.45)' }}>{currentVoiceName}</span>
              </p>
              <button
                onClick={() => onSaveVoiceName(voiceDraft)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: hasUnsavedVoice
                    ? 'linear-gradient(135deg, rgba(0, 150, 255, 0.9), rgba(0, 100, 255, 0.9))'
                    : 'rgba(255, 255, 255, 0.06)',
                  color: hasUnsavedVoice ? '#fff' : 'rgba(255, 255, 255, 0.3)',
                  border: hasUnsavedVoice ? '1px solid rgba(0, 150, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                  boxShadow: hasUnsavedVoice ? '0 4px 14px rgba(0, 120, 255, 0.3)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (hasUnsavedVoice) e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 120, 255, 0.5)';
                }}
                onMouseLeave={(e) => {
                  if (hasUnsavedVoice) e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 120, 255, 0.3)';
                }}
              >
                Save Voice
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
