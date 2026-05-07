import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const advanceTick = async () => {
  vi.advanceTimersByTime(1000);
  await flush();
};

describe('App visual input queue integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('alternates screenshots and a focus crop through realtime input', async () => {
    const sendRealtimeImage = vi.fn();
    const captureScreenshotJpeg = vi
      .fn()
      .mockResolvedValueOnce('screen-1')
      .mockResolvedValueOnce('screen-2')
      .mockResolvedValueOnce('screen-3')
      .mockResolvedValueOnce('screen-4');

    vi.stubGlobal('tana', {
      setIgnoreMouseEvents: vi.fn(),
      captureScreenshotJpeg,
    });

    vi.doMock('../../hooks/use-live-api', () => ({
      useLiveApi: () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        connectionState: 'connected' as const,
        messages: [],
        startMic: vi.fn(),
        stopMic: vi.fn(),
        isMicOn: true,
        sendRealtimeImage,
        sendTextContext: vi.fn(),
        appendSystemMessage: vi.fn(),
      }),
    }));

    vi.doMock('../../hooks/use-tool-state', () => ({
      useToolState: () => ({
        activeTool: 'focus-box',
        setActiveTool: vi.fn(),
        tools: [],
      }),
    }));

    vi.doMock('../../hooks/use-suggestions', () => ({
      useSuggestions: () => ({
        suggestions: [],
        visible: false,
        generateSuggestions: vi.fn(),
        dismiss: vi.fn(),
      }),
    }));

    vi.doMock('../../hooks/use-ai-overlays', () => ({
      useAIOverlays: () => ({
        overlays: [],
        addOverlay: vi.fn(),
        removeOverlay: vi.fn(),
        clearAll: vi.fn(),
        restoreSnapshot: vi.fn(),
      }),
    }));

    vi.doMock('../../hooks/use-session-memory', () => ({
      useSessionMemory: () => ({
        addTurn: vi.fn(),
        clear: vi.fn(),
      }),
    }));

    vi.doMock('../../hooks/use-settings', () => ({
      useSettings: () => ({
        apiKey: 'key',
        hasApiKey: true,
        showSettings: false,
        saveApiKey: vi.fn(),
        openSettings: vi.fn(),
        closeSettings: vi.fn(),
      }),
    }));

    vi.doMock('../../components/SettingsModal', () => ({
      __esModule: true,
      default: () => null,
    }));

    vi.doMock('../../components/ControlHUD', () => ({
      __esModule: true,
      default: () => null,
    }));

    vi.doMock('../../components/CanvasLayer', () => ({
      __esModule: true,
      default: React.forwardRef((props: any, ref) => {
        React.useImperativeHandle(ref, () => ({
          startStreaming: vi.fn(async () => true),
          stopStreaming: vi.fn(),
          captureRegion: vi.fn(() => null),
          getArtifacts: vi.fn(() => ({ boxes: [], strokes: [] })),
          clearStrokes: vi.fn(),
        }));

        return (
          <>
            <button
              type="button"
              data-testid="create-focus-box"
              onClick={() => props.onBoxCreated?.({ id: 'focus-1', x: 10, y: 10, width: 100, height: 80, createdAt: 1 }, 'focus-1-image')}
            >
              Create focus box
            </button>
          </>
        );
      }),
    }));

    const { default: App } = await import('../../App');
    render(<App />);

    await act(async () => {
      await flush();
    });

    fireEvent.click(screen.getByTestId('create-focus-box'));

    await act(async () => {
      await advanceTick();
      await advanceTick();
      await advanceTick();
    });

    expect(sendRealtimeImage.mock.calls).toEqual([
      ['screen-1', 'image/jpeg'],
      ['screen-2', 'image/jpeg'],
      ['focus-1-image', 'image/png'],
      ['screen-4', 'image/jpeg'],
    ]);
  });

  test('round-robins multiple focus boxes in creation order', async () => {
    const sendRealtimeImage = vi.fn();
    const captureScreenshotJpeg = vi
      .fn()
      .mockResolvedValueOnce('screen-1')
      .mockResolvedValueOnce('screen-2')
      .mockResolvedValueOnce('screen-3')
      .mockResolvedValueOnce('screen-4')
      .mockResolvedValueOnce('screen-5')
      .mockResolvedValueOnce('screen-6');

    vi.stubGlobal('tana', {
      setIgnoreMouseEvents: vi.fn(),
      captureScreenshotJpeg,
    });

    vi.doMock('../../hooks/use-live-api', () => ({
      useLiveApi: () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        connectionState: 'connected' as const,
        messages: [],
        startMic: vi.fn(),
        stopMic: vi.fn(),
        isMicOn: true,
        sendRealtimeImage,
        sendTextContext: vi.fn(),
        appendSystemMessage: vi.fn(),
      }),
    }));

    vi.doMock('../../hooks/use-tool-state', () => ({
      useToolState: () => ({
        activeTool: 'focus-box',
        setActiveTool: vi.fn(),
        tools: [],
      }),
    }));

    vi.doMock('../../hooks/use-suggestions', () => ({
      useSuggestions: () => ({
        suggestions: [],
        visible: false,
        generateSuggestions: vi.fn(),
        dismiss: vi.fn(),
      }),
    }));

    vi.doMock('../../hooks/use-ai-overlays', () => ({
      useAIOverlays: () => ({
        overlays: [],
        addOverlay: vi.fn(),
        removeOverlay: vi.fn(),
        clearAll: vi.fn(),
        restoreSnapshot: vi.fn(),
      }),
    }));

    vi.doMock('../../hooks/use-session-memory', () => ({
      useSessionMemory: () => ({
        addTurn: vi.fn(),
        clear: vi.fn(),
      }),
    }));

    vi.doMock('../../hooks/use-settings', () => ({
      useSettings: () => ({
        apiKey: 'key',
        hasApiKey: true,
        showSettings: false,
        saveApiKey: vi.fn(),
        openSettings: vi.fn(),
        closeSettings: vi.fn(),
      }),
    }));

    vi.doMock('../../components/SettingsModal', () => ({
      __esModule: true,
      default: () => null,
    }));

    vi.doMock('../../components/ControlHUD', () => ({
      __esModule: true,
      default: () => null,
    }));

    vi.doMock('../../components/CanvasLayer', () => ({
      __esModule: true,
      default: React.forwardRef((props: any, ref) => {
        React.useImperativeHandle(ref, () => ({
          startStreaming: vi.fn(async () => true),
          stopStreaming: vi.fn(),
          captureRegion: vi.fn(() => null),
          getArtifacts: vi.fn(() => ({ boxes: [], strokes: [] })),
          clearStrokes: vi.fn(),
        }));

        return (
          <>
            <button
              type="button"
              data-testid="create-focus-box-1"
              onClick={() => props.onBoxCreated?.({ id: 'focus-1', x: 10, y: 10, width: 100, height: 80, createdAt: 1 }, 'focus-1-image')}
            >
              Create focus box 1
            </button>
            <button
              type="button"
              data-testid="create-focus-box-2"
              onClick={() => props.onBoxCreated?.({ id: 'focus-2', x: 20, y: 20, width: 120, height: 90, createdAt: 2 }, 'focus-2-image')}
            >
              Create focus box 2
            </button>
          </>
        );
      }),
    }));

    const { default: App } = await import('../../App');
    render(<App />);

    await act(async () => {
      await flush();
    });

    fireEvent.click(screen.getByTestId('create-focus-box-1'));
    fireEvent.click(screen.getByTestId('create-focus-box-2'));

    await act(async () => {
      await advanceTick();
      await advanceTick();
      await advanceTick();
      await advanceTick();
      await advanceTick();
    });

    expect(sendRealtimeImage.mock.calls).toEqual([
      ['screen-1', 'image/jpeg'],
      ['screen-2', 'image/jpeg'],
      ['focus-1-image', 'image/png'],
      ['screen-4', 'image/jpeg'],
      ['focus-2-image', 'image/png'],
      ['screen-6', 'image/jpeg'],
    ]);
  });
});
