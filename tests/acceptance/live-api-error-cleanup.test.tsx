import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('acceptance: live API error cleanup', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('releases microphone and audio resources when the live API errors', async () => {
    const stoppedTrack = { stop: vi.fn() };
    const closedContexts: Array<{ close: ReturnType<typeof vi.fn> }> = [];
    let callbacks: Record<string, (...args: any[]) => void> = {};
    const sessionInputs: Array<ReturnType<typeof vi.fn>> = [];

    vi.stubGlobal(
      'AudioContext',
      class MockAudioContext {
        close = vi.fn(async () => undefined);
        currentTime = 0;
        destination = {};

        constructor() {
          closedContexts.push(this);
        }

        createMediaStreamSource() {
          return { connect: vi.fn() };
        }

        createScriptProcessor() {
          return { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null };
        }

        createBuffer() {
          return { getChannelData: () => new Float32Array(1), duration: 0.1 };
        }

        createBufferSource() {
          return { connect: vi.fn(), start: vi.fn(), onended: null, buffer: null };
        }
      }
    );

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [stoppedTrack],
        })),
      },
    });

    vi.doMock('@google/genai', () => ({
      GoogleGenAI: class MockGoogleGenAI {
        live = {
          connect: ({ callbacks: incomingCallbacks }: { callbacks: typeof callbacks }) => {
            callbacks = incomingCallbacks;
            callbacks.onopen?.();
            const sendRealtimeInput = vi.fn();
            sessionInputs.push(sendRealtimeInput);
            return Promise.resolve({
              close: vi.fn(),
              sendRealtimeInput,
              sendToolResponse: vi.fn(),
            });
          },
        };
      },
      Modality: { AUDIO: 'AUDIO' },
    }));

    const { useLiveApi } = await import('../../hooks/use-live-api');
    const { result } = renderHook(() => useLiveApi('valid-api-key'));

    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.startMic();
    });
    await act(async () => {
      callbacks.onerror?.(new Error('network failure'));
      await Promise.resolve();
    });

    expect(result.current.connectionState).toBe('error');
    expect(result.current.isMicOn).toBe(false);
    expect(stoppedTrack.stop).toHaveBeenCalled();
    expect(closedContexts.every((ctx) => ctx.close.mock.calls.length > 0)).toBe(true);

    await act(async () => {
      await result.current.connect();
    });

    await act(async () => {
      await result.current.sendRealtimeImage('fresh-frame', 'image/png');
      await Promise.resolve();
    });

    expect(result.current.connectionState).toBe('connected');
    expect(sessionInputs).toHaveLength(2);
    expect(sessionInputs[0]).not.toHaveBeenCalledWith({
      video: {
        mimeType: 'image/png',
        data: 'fresh-frame',
      },
    });
    expect(sessionInputs[1]).toHaveBeenCalledWith({
      video: {
        mimeType: 'image/png',
        data: 'fresh-frame',
      },
    });
  });
});
