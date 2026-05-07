import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockSession = {
  sendClientContent: vi.fn(),
  sendRealtimeInput: vi.fn(),
  sendToolResponse: vi.fn(),
  close: vi.fn(),
};

let latestCallbacks: {
  onopen: () => void;
  onmessage: (message: any) => void;
  onerror?: (error: Error) => void;
} | null = null;
let autoOpenOnConnect = true;
let latestProcessor: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onaudioprocess: ((event: any) => void) | null } | null = null;
let bufferSourceStarts: Array<ReturnType<typeof vi.fn>> = [];

const mockConnect = vi.fn(({ callbacks }: { callbacks: typeof latestCallbacks }) => {
  latestCallbacks = callbacks;
  if (autoOpenOnConnect) {
    callbacks?.onopen();
  }
  return Promise.resolve(mockSession);
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    live = { connect: mockConnect };
  },
  Modality: { AUDIO: 'AUDIO' },
}));

import { useLiveApi } from '../../hooks/use-live-api';

class MockAudioContext {
  currentTime = 0;
  destination = {};

  constructor(_options?: { sampleRate?: number }) {}

  createMediaStreamSource() {
    return { connect: vi.fn() };
  }

  createScriptProcessor() {
    latestProcessor = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null };
    return latestProcessor;
  }

  createBuffer() {
    return { getChannelData: () => new Float32Array(1), duration: 0.1 };
  }

  createBufferSource() {
    const start = vi.fn();
    bufferSourceStarts.push(start);
    return { connect: vi.fn(), start, onended: null, buffer: null };
  }

  close() {
    return Promise.resolve();
  }
}

describe('useLiveApi', () => {
  beforeEach(() => {
    mockSession.sendClientContent.mockReset();
    mockSession.sendRealtimeInput.mockReset();
    mockSession.sendToolResponse.mockReset();
    mockSession.close.mockReset();
    mockConnect.mockClear();
    latestCallbacks = null;
    autoOpenOnConnect = true;
    latestProcessor = null;
    bufferSourceStarts = [];
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('webkitAudioContext', MockAudioContext);
  });

  test('connects to Gemini 3.1 Flash Live with 3.1-safe config fields', async () => {
    const { result } = renderHook(() => useLiveApi('test-key', undefined, {
      voiceName: 'Puck',
    }));

    await act(async () => {
      await result.current.connect();
      await Promise.resolve();
    });

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockConnect.mock.calls[0]?.[0]).toMatchObject({
      model: 'gemini-3.1-flash-live-preview',
      config: {
        responseModalities: ['AUDIO'],
        thinkingConfig: {
          thinkingLevel: 'high',
        },
        realtimeInputConfig: {
          turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
        },
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Puck',
            },
          },
        },
      },
    });
  });

  test('ignores duplicate connect attempts while a connection is already in flight', async () => {
    autoOpenOnConnect = false;
    const { result } = renderHook(() => useLiveApi('test-key'));

    await act(async () => {
      await Promise.all([
        result.current.connect(),
        result.current.connect(),
      ]);
      await Promise.resolve();
    });

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(result.current.connectionState).toBe('connecting');
  });

  test('queues focus captures without triggering an immediate realtime turn', async () => {
    const { result } = renderHook(() => useLiveApi('test-key'));

    await act(async () => {
      await result.current.connect();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.sendRealtimeImage('focus-image', 'image/png');
      await Promise.resolve();
    });

    expect(mockSession.sendClientContent).not.toHaveBeenCalled();
    expect(mockSession.sendRealtimeInput).toHaveBeenCalledWith({
      video: {
        mimeType: 'image/png',
        data: 'focus-image',
      },
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages.at(-1)?.text).toBe('Tana is listening...');
  });

  test('processes both input and output transcriptions from the same server event', async () => {
    const { result } = renderHook(() => useLiveApi('test-key'));

    await act(async () => {
      await result.current.connect();
      await Promise.resolve();
    });

    await act(async () => {
      latestCallbacks?.onmessage({
        serverContent: {
          inputTranscription: { text: 'What is this?' },
          outputTranscription: { text: 'It is a settings panel.' },
        },
      });
      await Promise.resolve();
    });

    expect(result.current.messages.map(message => ({ role: message.role, text: message.text }))).toEqual([
      { role: 'system', text: 'Tana is listening...' },
      { role: 'user', text: 'What is this?' },
      { role: 'model', text: 'It is a settings panel.' },
    ]);
  });

  test('plays every audio part in a single server event', async () => {
    const { result } = renderHook(() => useLiveApi('test-key'));

    await act(async () => {
      await result.current.connect();
      await Promise.resolve();
    });

    await act(async () => {
      latestCallbacks?.onmessage({
        serverContent: {
          modelTurn: {
            parts: [
              { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAA=' } },
              { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAE=' } },
            ],
          },
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(bufferSourceStarts).toHaveLength(2);
    expect(bufferSourceStarts[0]).toHaveBeenCalledTimes(1);
    expect(bufferSourceStarts[1]).toHaveBeenCalledTimes(1);
  });

  test('clears the failed session after a live API error so reconnect can create a fresh session', async () => {
    const { result } = renderHook(() => useLiveApi('test-key'));

    await act(async () => {
      await result.current.connect();
      await Promise.resolve();
    });

    await act(async () => {
      latestCallbacks?.onerror?.(new Error('network failure'));
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.sendRealtimeImage('stale-image', 'image/png');
      await Promise.resolve();
    });

    expect(result.current.connectionState).toBe('error');
    expect(mockSession.sendRealtimeInput).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.connect();
      await Promise.resolve();
    });

    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  test('surfaces a friendly warning when the live API rejects a syntactically valid key', async () => {
    const { result } = renderHook(() => useLiveApi('AIzaSy12345678901234567890'));

    await act(async () => {
      await result.current.connect();
      await Promise.resolve();
    });

    await act(async () => {
      latestCallbacks?.onerror?.({
        message: 'API key not valid. Please pass a valid API key.',
        status: 401,
      } as Error & { status: number });
      await Promise.resolve();
    });

    expect(result.current.connectionState).toBe('error');
    expect(result.current.connectionErrorMessage).toBe(
      'Google rejected this API key or it does not have Gemini Live access. Check the key and try again.'
    );
  });

  test('ignores a late microphone stream if disconnect runs before getUserMedia resolves', async () => {
    let resolveUserMedia: ((stream: MediaStream) => void) | null = null;
    const stoppedTrack = { stop: vi.fn() };

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(() => new Promise((resolve) => {
          resolveUserMedia = resolve;
        })),
      },
    });

    const { result } = renderHook(() => useLiveApi('test-key'));

    await act(async () => {
      await result.current.connect();
      await Promise.resolve();
    });

    const startMicPromise = act(async () => {
      await result.current.startMic();
    });

    await act(async () => {
      result.current.disconnect();
      await Promise.resolve();
    });

    await act(async () => {
      resolveUserMedia?.({
        getTracks: () => [stoppedTrack],
      } as unknown as MediaStream);
      await Promise.resolve();
    });

    await startMicPromise;

    expect(stoppedTrack.stop).toHaveBeenCalledTimes(1);
    expect(result.current.isMicOn).toBe(false);
    expect(result.current.connectionState).toBe('disconnected');
  });

  test('sends microphone audio through the audio field and flushes with audioStreamEnd when paused', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
        })),
      },
    });

    const { result } = renderHook(() => useLiveApi('test-key'));

    await act(async () => {
      await result.current.connect();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.startMic();
      await Promise.resolve();
    });

    await act(async () => {
      latestProcessor?.onaudioprocess?.({
        inputBuffer: {
          getChannelData: () => new Float32Array([0.25, -0.25, 0.5]),
        },
      });
      await Promise.resolve();
    });

    expect(mockSession.sendRealtimeInput).toHaveBeenCalledWith({
      audio: {
        mimeType: 'audio/pcm;rate=16000',
        data: expect.any(String),
      },
    });

    await act(async () => {
      result.current.stopMic();
      await Promise.resolve();
    });

    expect(mockSession.sendRealtimeInput).toHaveBeenCalledWith({ audioStreamEnd: true });
  });

  test('drops queued realtime sends once the session has been disconnected', async () => {
    let resolveSession: ((session: typeof mockSession) => void) | null = null;
    const staleSession = {
      ...mockSession,
      sendRealtimeInput: vi.fn(() => {
        throw new Error('WebSocket is already in CLOSING or CLOSED state.');
      }),
      close: vi.fn(),
    };

    mockConnect.mockImplementationOnce(({ callbacks }: { callbacks: typeof latestCallbacks }) => {
      latestCallbacks = callbacks;
      callbacks?.onopen();
      return new Promise((resolve) => {
        resolveSession = resolve;
      });
    });

    const { result } = renderHook(() => useLiveApi('test-key'));

    await act(async () => {
      await result.current.connect();
      await Promise.resolve();
    });

    await act(async () => {
      void result.current.sendRealtimeImage('stale-frame', 'image/png');
      result.current.disconnect();
      resolveSession?.(staleSession);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(staleSession.sendRealtimeInput).not.toHaveBeenCalled();
    expect(staleSession.close).toHaveBeenCalledTimes(1);
    expect(result.current.connectionState).toBe('disconnected');
  });
});
