import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useSettings } from '../../hooks/use-settings';

describe('useSettings', () => {
  test('opens the modal on first run and saves trimmed keys', () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.showSettings).toBe(true);
    expect(result.current.hasApiKey).toBe(false);
    expect(result.current.voiceName).toBe('Kore');

    act(() => {
      result.current.closeSettings();
    });
    expect(result.current.showSettings).toBe(true);

    act(() => {
      result.current.saveApiKey('  abcdefghijklmnopqrstuvwxyz  ');
    });

    expect(localStorage.getItem('tana_api_key')).toBe('abcdefghijklmnopqrstuvwxyz');
    expect(result.current.hasApiKey).toBe(true);
    expect(result.current.showSettings).toBe(false);
  });

  test('restores and normalizes the stored voice setting', () => {
    localStorage.setItem('tana_live_voice_name', 'Puck');

    const { result } = renderHook(() => useSettings());

    expect(result.current.voiceName).toBe('Puck');
  });

  test('saves the voice setting', () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.saveVoiceName('Zephyr');
    });

    expect(localStorage.getItem('tana_live_voice_name')).toBe('Zephyr');
    expect(result.current.voiceName).toBe('Zephyr');
  });

  test('restores a previously saved API key', () => {
    localStorage.setItem('tana_api_key', 'saved-key');

    const { result } = renderHook(() => useSettings());

    expect(result.current.apiKey).toBe('saved-key');
    expect(result.current.showSettings).toBe(false);
  });

  test('normalizes a previously saved API key from storage', () => {
    localStorage.setItem('tana_api_key', '  saved-key  ');

    const { result } = renderHook(() => useSettings());

    expect(result.current.apiKey).toBe('saved-key');
    expect(localStorage.getItem('tana_api_key')).toBe('saved-key');
    expect(result.current.showSettings).toBe(false);
  });
});
