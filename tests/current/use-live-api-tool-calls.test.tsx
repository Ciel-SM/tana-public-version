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
  onclose?: () => void;
  onerror?: (error: Error) => void;
} | null = null;

const mockConnect = vi.fn(({ callbacks }: { callbacks: typeof latestCallbacks }) => {
  latestCallbacks = callbacks;
  callbacks?.onopen();
  return Promise.resolve(mockSession);
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    live = { connect: mockConnect };
  },
  Modality: { AUDIO: 'AUDIO' },
}));

vi.mock('../../lib/debug/live-trace', () => ({
  liveTrace: vi.fn(),
}));

import { useLiveApi, OverlayCallbacks } from '../../hooks/use-live-api';

class MockAudioContext {
  currentTime = 0;
  destination = {};
  constructor(_options?: { sampleRate?: number }) {}
  close() { return Promise.resolve(); }
  createMediaStreamSource() { return { connect: vi.fn() }; }
  createScriptProcessor() { return { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null }; }
  createBuffer() { return { getChannelData: () => new Float32Array(1), duration: 0.1 }; }
  createBufferSource() { return { connect: vi.fn(), start: vi.fn(), onended: null, buffer: null }; }
}

function createOverlayCallbacks() {
  let overlayCounter = 0;
  const cbs: OverlayCallbacks = {
    addOverlay: vi.fn(() => `overlay-${++overlayCounter}`) as any,
    removeOverlay: vi.fn() as any,
    clearAll: vi.fn() as any,
    restoreSnapshot: vi.fn() as any,
  };
  return cbs as OverlayCallbacks & {
    addOverlay: ReturnType<typeof vi.fn>;
    removeOverlay: ReturnType<typeof vi.fn>;
    clearAll: ReturnType<typeof vi.fn>;
    restoreSnapshot: ReturnType<typeof vi.fn>;
  };
}

describe('useLiveApi tool call handling', () => {
  beforeEach(() => {
    mockSession.sendClientContent.mockReset();
    mockSession.sendRealtimeInput.mockReset();
    mockSession.sendToolResponse.mockReset();
    mockSession.close.mockReset();
    mockConnect.mockClear();
    latestCallbacks = null;
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('webkitAudioContext', MockAudioContext);
    // Stable screen dimensions for coordinate mapping
    Object.defineProperty(window, 'innerWidth', { value: 1000, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 500, writable: true, configurable: true });
  });

  async function connectHook(overlayCallbacks: OverlayCallbacks) {
    const { result } = renderHook(() =>
      useLiveApi('test-key-1234567890', undefined, { voiceName: 'Kore' }, overlayCallbacks)
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.connectionState).toBe('connected');
    return result;
  }

  test('draw_overlays tool call invokes addOverlay with mapped pixel coords', async () => {
    const callbacks = createOverlayCallbacks();
    await connectHook(callbacks);

    await act(async () => {
      latestCallbacks?.onmessage({
        toolCall: {
          functionCalls: [{
            id: 'tc-1',
            name: 'draw_overlays',
            args: {
              overlays: [
                { type: 'highlight', x: 500, y: 200, width: 100, height: 50, label: 'Test' },
              ],
              duration_ms: 4000,
            },
          }],
        },
      });
    });

    expect(callbacks.addOverlay).toHaveBeenCalledTimes(1);
    expect(callbacks.addOverlay).toHaveBeenCalledWith(
      'highlight',
      500,  // (500/1000) * 1000 = 500
      100,  // (200/1000) * 500 = 100
      expect.objectContaining({
        width: 100,   // (100/1000) * 1000 = 100
        height: 25,   // (50/1000) * 500 = 25
        label: 'Test',
        duration: 4000,
      }),
    );
  });

  test('sendToolResponse is sent with matching id and name', async () => {
    const callbacks = createOverlayCallbacks();
    await connectHook(callbacks);

    await act(async () => {
      latestCallbacks?.onmessage({
        toolCall: {
          functionCalls: [{
            id: 'tc-resp',
            name: 'draw_overlays',
            args: {
              overlays: [{ type: 'pointer', x: 100, y: 100 }],
            },
          }],
        },
      });
    });

    // sendToolResponse is called async via sessionPromise.then
    await act(async () => { await Promise.resolve(); });

    expect(mockSession.sendToolResponse).toHaveBeenCalledWith({
      functionResponses: [
        expect.objectContaining({
          id: 'tc-resp',
          name: 'draw_overlays',
        }),
      ],
    });
  });

  test('malformed tool args are ignored safely — valid overlays still render', async () => {
    const callbacks = createOverlayCallbacks();
    await connectHook(callbacks);

    await act(async () => {
      latestCallbacks?.onmessage({
        toolCall: {
          functionCalls: [{
            id: 'tc-mixed',
            name: 'draw_overlays',
            args: {
              overlays: [
                { type: 'invalid-type', x: 100, y: 100 },         // bad type
                { type: 'pointer', x: NaN, y: 100 },              // NaN x
                { type: 'pointer', x: Infinity, y: 100 },         // Infinity x
                { type: 'arrow', x: 100, y: 100 },                // arrow missing target
                { type: 'pointer', x: 500, y: 500 },              // valid
                { type: 'highlight', x: 200, y: 300, width: 100, height: 50 }, // valid
              ],
            },
          }],
        },
      });
    });

    // Only 2 valid overlays should be added
    expect(callbacks.addOverlay).toHaveBeenCalledTimes(2);

    // sendToolResponse still fires
    await act(async () => { await Promise.resolve(); });
    expect(mockSession.sendToolResponse).toHaveBeenCalledTimes(1);
  });

  test('structurally unusable call (overlays not an array) sends error response', async () => {
    const callbacks = createOverlayCallbacks();
    await connectHook(callbacks);

    await act(async () => {
      latestCallbacks?.onmessage({
        toolCall: {
          functionCalls: [{
            id: 'tc-bad',
            name: 'draw_overlays',
            args: { overlays: 'not-an-array' },
          }],
        },
      });
    });

    expect(callbacks.addOverlay).not.toHaveBeenCalled();

    await act(async () => { await Promise.resolve(); });
    expect(mockSession.sendToolResponse).toHaveBeenCalledWith({
      functionResponses: [
        expect.objectContaining({
          id: 'tc-bad',
          name: 'draw_overlays',
          response: { error: 'overlays must be an array' },
        }),
      ],
    });
  });

  test('toolCallCancellation removes tracked overlays', async () => {
    const callbacks = createOverlayCallbacks();
    await connectHook(callbacks);

    // First, draw some overlays
    await act(async () => {
      latestCallbacks?.onmessage({
        toolCall: {
          functionCalls: [{
            id: 'tc-cancel',
            name: 'draw_overlays',
            args: {
              overlays: [
                { type: 'pointer', x: 100, y: 100 },
                { type: 'pointer', x: 200, y: 200 },
              ],
            },
          }],
        },
      });
    });

    expect(callbacks.addOverlay).toHaveBeenCalledTimes(2);

    // Now cancel that tool call
    await act(async () => {
      latestCallbacks?.onmessage({
        toolCallCancellation: {
          ids: ['tc-cancel'],
        },
      });
    });

    expect(callbacks.removeOverlay).toHaveBeenCalledTimes(2);
    expect(callbacks.removeOverlay).toHaveBeenCalledWith('overlay-1');
    expect(callbacks.removeOverlay).toHaveBeenCalledWith('overlay-2');
  });

  test('clear_overlays clears all overlays and tracking state', async () => {
    const callbacks = createOverlayCallbacks();
    await connectHook(callbacks);

    // Draw overlays first
    await act(async () => {
      latestCallbacks?.onmessage({
        toolCall: {
          functionCalls: [{
            id: 'tc-pre',
            name: 'draw_overlays',
            args: { overlays: [{ type: 'pointer', x: 100, y: 100 }] },
          }],
        },
      });
    });

    // Clear them
    await act(async () => {
      latestCallbacks?.onmessage({
        toolCall: {
          functionCalls: [{
            id: 'tc-clear',
            name: 'clear_overlays',
            args: {},
          }],
        },
      });
    });

    expect(callbacks.clearAll).toHaveBeenCalledTimes(1);

    // Cancelling the earlier tool call should NOT try to remove overlays
    // because the tracking map was cleared
    callbacks.removeOverlay.mockReset();
    await act(async () => {
      latestCallbacks?.onmessage({
        toolCallCancellation: { ids: ['tc-pre'] },
      });
    });

    expect(callbacks.removeOverlay).not.toHaveBeenCalled();
  });

  test('arrow overlay with valid target coordinates is created', async () => {
    const callbacks = createOverlayCallbacks();
    await connectHook(callbacks);

    await act(async () => {
      latestCallbacks?.onmessage({
        toolCall: {
          functionCalls: [{
            id: 'tc-arrow',
            name: 'draw_overlays',
            args: {
              overlays: [
                { type: 'arrow', x: 100, y: 200, target_x: 800, target_y: 400, label: 'Click here' },
              ],
            },
          }],
        },
      });
    });

    expect(callbacks.addOverlay).toHaveBeenCalledWith(
      'arrow',
      100,  // (100/1000) * 1000
      100,  // (200/1000) * 500
      expect.objectContaining({
        targetX: 800,  // (800/1000) * 1000
        targetY: 200,  // (400/1000) * 500
        label: 'Click here',
      }),
    );
  });

  test('coordinates are clamped to 0-1000 range', async () => {
    const callbacks = createOverlayCallbacks();
    await connectHook(callbacks);

    await act(async () => {
      latestCallbacks?.onmessage({
        toolCall: {
          functionCalls: [{
            id: 'tc-clamp',
            name: 'draw_overlays',
            args: {
              overlays: [
                { type: 'pointer', x: -50, y: 1500 },
              ],
            },
          }],
        },
      });
    });

    expect(callbacks.addOverlay).toHaveBeenCalledWith(
      'pointer',
      0,    // clamped from -50 -> 0, then (0/1000) * 1000 = 0
      500,  // clamped from 1500 -> 1000, then (1000/1000) * 500 = 500
      expect.anything(),
    );
  });

  test('cancelling clear_overlays calls restoreLast and restores tracking map', async () => {
    const callbacks = createOverlayCallbacks();
    await connectHook(callbacks);

    // Draw some overlays
    await act(async () => {
      latestCallbacks?.onmessage({
        toolCall: {
          functionCalls: [{
            id: 'tc-draw',
            name: 'draw_overlays',
            args: { overlays: [{ type: 'pointer', x: 100, y: 100 }] },
          }],
        },
      });
    });

    expect(callbacks.addOverlay).toHaveBeenCalledTimes(1);

    // Clear overlays
    await act(async () => {
      latestCallbacks?.onmessage({
        toolCall: {
          functionCalls: [{
            id: 'tc-clear-cancel',
            name: 'clear_overlays',
            args: {},
          }],
        },
      });
    });

    expect(callbacks.clearAll).toHaveBeenCalledTimes(1);

    // Cancel the clear — should restore
    await act(async () => {
      latestCallbacks?.onmessage({
        toolCallCancellation: { ids: ['tc-clear-cancel'] },
      });
    });

    expect(callbacks.restoreSnapshot).toHaveBeenCalledTimes(1);
    expect(callbacks.restoreSnapshot).toHaveBeenCalledWith('tc-clear-cancel');

    // The tracking map for the original draw should be restored,
    // so cancelling tc-draw should now remove its overlay
    await act(async () => {
      latestCallbacks?.onmessage({
        toolCallCancellation: { ids: ['tc-draw'] },
      });
    });

    expect(callbacks.removeOverlay).toHaveBeenCalledWith('overlay-1');
  });

  test('handleOverlayExpired prunes expired overlay from tracking map', async () => {
    const callbacks = createOverlayCallbacks();
    const { result } = renderHook(() =>
      useLiveApi('test-key-1234567890', undefined, { voiceName: 'Kore' }, callbacks)
    );

    await act(async () => {
      await result.current.connect();
    });

    // Draw overlays
    await act(async () => {
      latestCallbacks?.onmessage({
        toolCall: {
          functionCalls: [{
            id: 'tc-expire',
            name: 'draw_overlays',
            args: {
              overlays: [
                { type: 'pointer', x: 100, y: 100 },
                { type: 'pointer', x: 200, y: 200 },
              ],
            },
          }],
        },
      });
    });

    expect(callbacks.addOverlay).toHaveBeenCalledTimes(2);

    // Simulate first overlay expiring
    act(() => {
      result.current.handleOverlayExpired('overlay-1');
    });

    // Cancel tc-expire — should only try to remove overlay-2 (overlay-1 was pruned)
    callbacks.removeOverlay.mockReset();
    await act(async () => {
      latestCallbacks?.onmessage({
        toolCallCancellation: { ids: ['tc-expire'] },
      });
    });

    expect(callbacks.removeOverlay).toHaveBeenCalledTimes(1);
    expect(callbacks.removeOverlay).toHaveBeenCalledWith('overlay-2');
  });
});
