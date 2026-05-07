import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockSession = {
  sendClientContent: vi.fn(),
  sendRealtimeInput: vi.fn(),
  sendToolResponse: vi.fn(),
  close: vi.fn(),
};

const mockConnect = vi.fn(({ callbacks }: { callbacks: { onopen: () => void } }) => {
  callbacks.onopen();
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

  close() {
    return Promise.resolve();
  }
}

describe('acceptance: focus box capture stays passive until the user asks a question', () => {
  beforeEach(() => {
    mockSession.sendClientContent.mockReset();
    mockSession.sendRealtimeInput.mockReset();
    mockSession.close.mockReset();
    mockConnect.mockClear();
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('webkitAudioContext', MockAudioContext);
  });

  test('queues the crop as context instead of sending an immediate reply-triggering realtime input', async () => {
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
    expect(mockSession.sendRealtimeInput).toHaveBeenCalledTimes(1);
    expect(mockSession.sendRealtimeInput).toHaveBeenCalledWith({
      video: {
        mimeType: 'image/png',
        data: 'focus-image',
      },
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages.at(-1)?.text).toBe('Tana is listening...');
  });
});
