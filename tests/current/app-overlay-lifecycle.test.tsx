import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('App overlay lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('stops streaming and resets the active tool when the live connection leaves connected', async () => {
    const stopStreaming = vi.fn();
    const setActiveTool = vi.fn();
    const liveState = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      connectionState: 'connected' as const | 'error',
      messages: [],
      startMic: vi.fn(),
      stopMic: vi.fn(),
      isMicOn: true,
      sendRealtimeImage: vi.fn(),
      sendTextContext: vi.fn(),
      appendSystemMessage: vi.fn(),
    };

    vi.stubGlobal('tana', {
      setIgnoreMouseEvents: vi.fn(),
    });

    vi.doMock('../../hooks/use-live-api', () => ({
      useLiveApi: () => liveState,
    }));

    vi.doMock('../../hooks/use-tool-state', () => ({
      useToolState: () => ({
        activeTool: 'focus-box',
        setActiveTool,
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

    vi.doMock('../../hooks/use-visual-input-queue', () => ({
      useVisualInputQueue: () => ({
        upsertFocusRegion: vi.fn(),
        removeFocusRegion: vi.fn(),
        clear: vi.fn(),
      }),
    }));

    vi.doMock('../../components/CanvasLayer', async () => {
      const ReactModule = await import('react');

      return {
        __esModule: true,
        default: ReactModule.forwardRef((_props, ref) => {
          ReactModule.useImperativeHandle(ref, () => ({
            startStreaming: vi.fn(async () => true),
            stopStreaming,
            captureRegion: vi.fn(() => null),
            getArtifacts: vi.fn(() => ({ boxes: [], strokes: [] })),
            clearStrokes: vi.fn(),
          }));
          return <div data-testid="canvas-layer" />;
        }),
      };
    });

    const { default: App } = await import('../../App');
    const view = render(<App />);

    liveState.connectionState = 'error';
    view.rerender(<App />);

    expect(stopStreaming).toHaveBeenCalled();
    expect(setActiveTool).toHaveBeenCalledWith('cursor');
  });

  test('stops streaming and resets the active tool when the initial connection fails before reaching connected', async () => {
    const stopStreaming = vi.fn();
    const setActiveTool = vi.fn();
    const clearVisualQueue = vi.fn();
    const clearOverlays = vi.fn();
    const dismissSuggestions = vi.fn();
    const liveState = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      connectionState: 'connecting' as const | 'error',
      messages: [],
      startMic: vi.fn(),
      stopMic: vi.fn(),
      isMicOn: false,
      sendRealtimeImage: vi.fn(),
      sendTextContext: vi.fn(),
      appendSystemMessage: vi.fn(),
    };

    vi.stubGlobal('tana', {
      setIgnoreMouseEvents: vi.fn(),
    });

    vi.doMock('../../hooks/use-live-api', () => ({
      useLiveApi: () => liveState,
    }));

    vi.doMock('../../hooks/use-tool-state', () => ({
      useToolState: () => ({
        activeTool: 'focus-box',
        setActiveTool,
        tools: [],
      }),
    }));

    vi.doMock('../../hooks/use-suggestions', () => ({
      useSuggestions: () => ({
        suggestions: [],
        visible: false,
        generateSuggestions: vi.fn(),
        dismiss: dismissSuggestions,
      }),
    }));

    vi.doMock('../../hooks/use-ai-overlays', () => ({
      useAIOverlays: () => ({
        overlays: [],
        addOverlay: vi.fn(),
        removeOverlay: vi.fn(),
        clearAll: clearOverlays,
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

    vi.doMock('../../hooks/use-visual-input-queue', () => ({
      useVisualInputQueue: () => ({
        upsertFocusRegion: vi.fn(),
        removeFocusRegion: vi.fn(),
        clear: clearVisualQueue,
      }),
    }));

    vi.doMock('../../components/CanvasLayer', async () => {
      const ReactModule = await import('react');

      return {
        __esModule: true,
        default: ReactModule.forwardRef((_props, ref) => {
          ReactModule.useImperativeHandle(ref, () => ({
            startStreaming: vi.fn(async () => true),
            stopStreaming,
            captureRegion: vi.fn(() => null),
            getArtifacts: vi.fn(() => ({ boxes: [], strokes: [] })),
            clearStrokes: vi.fn(),
          }));
          return <div data-testid="canvas-layer" />;
        }),
      };
    });

    const { default: App } = await import('../../App');
    const view = render(<App />);

    liveState.connectionState = 'error';
    view.rerender(<App />);

    expect(stopStreaming).toHaveBeenCalled();
    expect(clearVisualQueue).toHaveBeenCalled();
    expect(clearOverlays).toHaveBeenCalled();
    expect(dismissSuggestions).toHaveBeenCalled();
    expect(setActiveTool).toHaveBeenCalledWith('cursor');
  });

  test('subscribes to the Electron global Escape event and routes it through the disconnect flow', async () => {
    let escapeHandler: (() => void) | undefined;
    const removeEscapeListener = vi.fn();
    const disconnect = vi.fn();
    const stopStreaming = vi.fn();
    const setActiveTool = vi.fn();
    const clearVisualQueue = vi.fn();
    const clearOverlays = vi.fn();
    const dismissSuggestions = vi.fn();
    const clearMemory = vi.fn();

    vi.stubGlobal('tana', {
      onGlobalEscape: vi.fn((handler: () => void) => {
        escapeHandler = handler;
        return removeEscapeListener;
      }),
      setIgnoreMouseEvents: vi.fn(),
    });

    vi.doMock('../../hooks/use-live-api', () => ({
      useLiveApi: () => ({
        connect: vi.fn(),
        disconnect,
        connectionState: 'connected',
        messages: [],
        startMic: vi.fn(),
        stopMic: vi.fn(),
        isMicOn: true,
        sendRealtimeImage: vi.fn(),
        sendTextContext: vi.fn(),
        appendSystemMessage: vi.fn(),
      }),
    }));

    vi.doMock('../../hooks/use-tool-state', () => ({
      useToolState: () => ({
        activeTool: 'focus-box',
        setActiveTool,
        tools: [],
      }),
    }));

    vi.doMock('../../hooks/use-suggestions', () => ({
      useSuggestions: () => ({
        suggestions: [],
        visible: false,
        generateSuggestions: vi.fn(),
        dismiss: dismissSuggestions,
      }),
    }));

    vi.doMock('../../hooks/use-ai-overlays', () => ({
      useAIOverlays: () => ({
        overlays: [],
        addOverlay: vi.fn(),
        removeOverlay: vi.fn(),
        clearAll: clearOverlays,
        restoreSnapshot: vi.fn(),
      }),
    }));

    vi.doMock('../../hooks/use-session-memory', () => ({
      useSessionMemory: () => ({
        addTurn: vi.fn(),
        clear: clearMemory,
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

    vi.doMock('../../hooks/use-visual-input-queue', () => ({
      useVisualInputQueue: () => ({
        upsertFocusRegion: vi.fn(),
        removeFocusRegion: vi.fn(),
        clear: clearVisualQueue,
      }),
    }));

    vi.doMock('../../components/CanvasLayer', async () => {
      const ReactModule = await import('react');

      return {
        __esModule: true,
        default: ReactModule.forwardRef((_props, ref) => {
          ReactModule.useImperativeHandle(ref, () => ({
            startStreaming: vi.fn(async () => true),
            stopStreaming,
            captureRegion: vi.fn(() => null),
            getArtifacts: vi.fn(() => ({ boxes: [], strokes: [] })),
            clearStrokes: vi.fn(),
          }));
          return <div data-testid="canvas-layer" />;
        }),
      };
    });

    const { default: App } = await import('../../App');
    const view = render(<App />);

    act(() => {
      escapeHandler?.();
    });

    expect(disconnect).toHaveBeenCalled();
    expect(stopStreaming).toHaveBeenCalled();
    expect(clearVisualQueue).toHaveBeenCalled();
    expect(clearOverlays).toHaveBeenCalled();
    expect(dismissSuggestions).toHaveBeenCalled();
    expect(clearMemory).toHaveBeenCalled();
    expect(setActiveTool).toHaveBeenCalledWith('cursor');

    view.unmount();

    expect(removeEscapeListener).toHaveBeenCalled();
  });
});
