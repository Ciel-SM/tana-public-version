import { useState, useCallback, useEffect } from 'react';
import { normalizeApiKey } from '../lib/google-api-errors';
import {
  DEFAULT_LIVE_VOICE_NAME,
  normalizeLiveVoiceName,
} from '../lib/live-voice-options';

const API_KEY_STORAGE_KEY = 'tana_api_key';
const LIVE_VOICE_STORAGE_KEY = 'tana_live_voice_name';
const LITE_MODE_STORAGE_KEY = 'tana_lite_mode';
const LITE_MODE_OVERRIDE_STORAGE_KEY = 'tana_lite_mode_overridden';
const LOW_MEMORY_THRESHOLD_MB = 8 * 1024;

export interface Settings {
  apiKey: string;
  voiceName: string;
  liteMode: boolean;
}

interface RuntimeProfile {
  totalMemoryMb?: number;
  liteModeOverride?: { enabled: boolean; source: 'argv' | 'env' } | null;
}

function readStoredLiteMode(): boolean | null {
  try {
    const stored = localStorage.getItem(LITE_MODE_STORAGE_KEY);
    if (stored == null) return null;
    return stored === 'true';
  } catch {
    return null;
  }
}

function hasLiteModeOverride(): boolean {
  try {
    return localStorage.getItem(LITE_MODE_OVERRIDE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function inferInitialLiteMode(): boolean {
  const storedLiteMode = readStoredLiteMode();
  if (storedLiteMode != null) {
    return storedLiteMode;
  }

  const nav = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
  if (typeof nav?.deviceMemory === 'number' && nav.deviceMemory > 0) {
    return nav.deviceMemory <= 8;
  }

  return false;
}

function readStoredApiKey(): string {
  try {
    const stored = localStorage.getItem(API_KEY_STORAGE_KEY) || '';
    const normalized = normalizeApiKey(stored) || '';

    if (stored !== normalized) {
      if (normalized) {
        localStorage.setItem(API_KEY_STORAGE_KEY, normalized);
      } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
      }
    }

    return normalized;
  } catch {
    return '';
  }
}

function readStoredVoiceName(): string {
  try {
    const stored = localStorage.getItem(LIVE_VOICE_STORAGE_KEY);
    const normalized = normalizeLiveVoiceName(stored);

    if (stored !== normalized) {
      localStorage.setItem(LIVE_VOICE_STORAGE_KEY, normalized);
    }

    return normalized;
  } catch {
    return DEFAULT_LIVE_VOICE_NAME;
  }
}

export function useSettings() {
  const [apiKey, setApiKeyState] = useState<string>(() => readStoredApiKey());
  const [voiceName, setVoiceNameState] = useState<string>(() => readStoredVoiceName());
  const [liteMode, setLiteModeState] = useState<boolean>(() => inferInitialLiteMode());
  const [isLiteModeRecommended, setIsLiteModeRecommended] = useState<boolean>(() => inferInitialLiteMode());
  const [liteModeOverrideSource, setLiteModeOverrideSource] = useState<'argv' | 'env' | null>(null);

  const [showSettings, setShowSettings] = useState<boolean>(() => {
    return !readStoredApiKey();
  });

  const saveApiKey = useCallback((key: string) => {
    const trimmed = normalizeApiKey(key) || '';
    try {
      localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
    } catch (e) {
      console.error('[Settings] Failed to save API key:', e);
    }
    setApiKeyState(trimmed);
    setShowSettings(false);
  }, []);

  const clearApiKey = useCallback(() => {
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    } catch (e) {
      console.error('[Settings] Failed to clear API key:', e);
    }
    setApiKeyState('');
    setShowSettings(true);
  }, []);

  const saveVoiceName = useCallback((value: string) => {
    const normalized = normalizeLiveVoiceName(value);
    try {
      localStorage.setItem(LIVE_VOICE_STORAGE_KEY, normalized);
    } catch (e) {
      console.error('[Settings] Failed to save voice name:', e);
    }
    setVoiceNameState(normalized);
  }, []);

  const saveLiteMode = useCallback((value: boolean) => {
    try {
      localStorage.setItem(LITE_MODE_STORAGE_KEY, String(value));
      localStorage.setItem(LITE_MODE_OVERRIDE_STORAGE_KEY, 'true');
    } catch (e) {
      console.error('[Settings] Failed to save lite mode:', e);
    }
    setLiteModeState(value);
  }, []);

  useEffect(() => {
    const tana = (window as any).tana;
    if (!tana?.getRuntimeProfile) return;

    void tana.getRuntimeProfile()
      .then((profile: RuntimeProfile) => {
        const override = profile.liteModeOverride;
        if (override) {
          setLiteModeOverrideSource(override.source);
          setLiteModeState(override.enabled);
        } else {
          setLiteModeOverrideSource(null);
        }

        const recommended = typeof profile.totalMemoryMb === 'number'
          && profile.totalMemoryMb > 0
          && profile.totalMemoryMb <= LOW_MEMORY_THRESHOLD_MB;

        setIsLiteModeRecommended(recommended);

        if (override || hasLiteModeOverride()) {
          return;
        }

        setLiteModeState(recommended);
        try {
          localStorage.setItem(LITE_MODE_STORAGE_KEY, String(recommended));
        } catch (e) {
          console.error('[Settings] Failed to sync lite mode recommendation:', e);
        }
      })
      .catch((e: Error) => {
        console.error('[Settings] Failed to load runtime profile:', e);
      });
  }, []);

  const openSettings = useCallback(() => setShowSettings(true), []);
  const closeSettings = useCallback(() => {
    // Only allow closing if a key is already saved
    if (apiKey) setShowSettings(false);
  }, [apiKey]);

  return {
    apiKey,
    voiceName,
    liteMode,
    isLiteModeRecommended,
    liteModeOverrideSource,
    hasApiKey: !!apiKey,
    showSettings,
    saveApiKey,
    saveVoiceName,
    saveLiteMode,
    clearApiKey,
    openSettings,
    closeSettings,
  };
}
