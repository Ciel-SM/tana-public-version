import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('App start warning', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('opens settings with an invalid-key warning when start is clicked with an obviously bad saved key', async () => {
    const connect = vi.fn();
    const startStreaming = vi.fn(async () => true);

    vi.stubGlobal('tana', {
      setIgnoreMouseEvents: vi.fn(),
    });

    vi.doMock('../../hooks/use-live-api', () => ({
      useLiveApi: () => ({
        connect,
        disconnect: vi.fn(),
        connectionState: 'disconnected' as const,
        connectionErrorMessage: '',
        messages: [],
        startMic: vi.fn(),
        stopMic: vi.fn(),
        isMicOn: false,
        sendRealtimeImage: vi.fn(),
        sendTextContext: vi.fn(),
        appendSystemMessage: vi.fn(),
      }),
    }));

    vi.doMock('../../hooks/use-tool-state', () => ({
      useToolState: () => ({
        activeTool: 'cursor',
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

    vi.doMock('../../hooks/use-settings', async () => {
      const ReactModule = await import('react');

      return {
        useSettings: () => {
          const [showSettings, setShowSettings] = ReactModule.useState(false);

          return {
            apiKey: 'short-key',
            hasApiKey: true,
            showSettings,
            saveApiKey: vi.fn(),
            clearApiKey: vi.fn(),
            openSettings: () => setShowSettings(true),
            closeSettings: vi.fn(),
          };
        },
      };
    });

    vi.doMock('../../hooks/use-visual-input-queue', () => ({
      useVisualInputQueue: () => ({
        upsertFocusRegion: vi.fn(),
        removeFocusRegion: vi.fn(),
        clear: vi.fn(),
      }),
    }));

    vi.doMock('../../hooks/use-mind-palace-pipeline', () => ({
      useMindPalacePipeline: () => ({
        enabled: false,
        setEnabled: vi.fn(),
        onCaptureTick: vi.fn(),
        pendingEmbeds: 0,
        stats: null,
      }),
    }));

    vi.doMock('../../hooks/use-mind-palace-sidebar', () => ({
      useMindPalaceSidebar: () => ({
        isOpen: false,
        open: vi.fn(),
        close: vi.fn(),
        toggle: vi.fn(),
        query: '',
        setQuery: vi.fn(),
        results: [],
        isSearching: false,
        thumbnailCache: {},
        loadThumbnail: vi.fn(),
      }),
    }));

    vi.doMock('../../components/CanvasLayer', async () => {
      const ReactModule = await import('react');

      return {
        __esModule: true,
        default: ReactModule.forwardRef((_props, ref) => {
          ReactModule.useImperativeHandle(ref, () => ({
            startStreaming,
            stopStreaming: vi.fn(),
            captureRegion: vi.fn(() => null),
            getArtifacts: vi.fn(() => ({ boxes: [], strokes: [] })),
            clearStrokes: vi.fn(),
          }));
          return <div data-testid="canvas-layer" />;
        }),
      };
    });

    vi.doMock('../../components/ControlHUD', () => ({
      __esModule: true,
      default: (props: { onConnect: () => void }) => (
        <button type="button" onClick={props.onConnect}>
          Start
        </button>
      ),
    }));

    vi.doMock('../../components/SettingsModal', () => ({
      __esModule: true,
      default: (props: { isOpen: boolean; initialError?: string }) => (
        props.isOpen ? <div>{props.initialError}</div> : null
      ),
    }));

    vi.doMock('../../components/MindPalaceSidebar', () => ({
      __esModule: true,
      default: () => null,
    }));

    vi.doMock('../../components/MindPalace3DView', () => ({
      __esModule: true,
      default: () => null,
    }));

    const { default: App } = await import('../../App');
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByText('That API key looks invalid. Check it and try again.')).toBeInTheDocument();
    expect(startStreaming).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  test('opens settings with the rejected-key warning after the live API errors', async () => {
    vi.stubGlobal('tana', {
      setIgnoreMouseEvents: vi.fn(),
    });

    vi.doMock('../../hooks/use-live-api', () => ({
      useLiveApi: () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        connectionState: 'error' as const,
        connectionErrorMessage: 'Google rejected this API key or it does not have Gemini Live access. Check the key and try again.',
        messages: [],
        startMic: vi.fn(),
        stopMic: vi.fn(),
        isMicOn: false,
        sendRealtimeImage: vi.fn(),
        sendTextContext: vi.fn(),
        appendSystemMessage: vi.fn(),
      }),
    }));

    vi.doMock('../../hooks/use-tool-state', () => ({
      useToolState: () => ({
        activeTool: 'cursor',
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

    vi.doMock('../../hooks/use-settings', async () => {
      const ReactModule = await import('react');

      return {
        useSettings: () => {
          const [showSettings, setShowSettings] = ReactModule.useState(false);

          return {
            apiKey: 'AIzaSy12345678901234567890',
            hasApiKey: true,
            showSettings,
            saveApiKey: vi.fn(),
            clearApiKey: vi.fn(),
            openSettings: () => setShowSettings(true),
            closeSettings: vi.fn(),
          };
        },
      };
    });

    vi.doMock('../../hooks/use-visual-input-queue', () => ({
      useVisualInputQueue: () => ({
        upsertFocusRegion: vi.fn(),
        removeFocusRegion: vi.fn(),
        clear: vi.fn(),
      }),
    }));

    vi.doMock('../../hooks/use-mind-palace-pipeline', () => ({
      useMindPalacePipeline: () => ({
        enabled: false,
        setEnabled: vi.fn(),
        onCaptureTick: vi.fn(),
        pendingEmbeds: 0,
        stats: null,
      }),
    }));

    vi.doMock('../../hooks/use-mind-palace-sidebar', () => ({
      useMindPalaceSidebar: () => ({
        isOpen: false,
        open: vi.fn(),
        close: vi.fn(),
        toggle: vi.fn(),
        query: '',
        setQuery: vi.fn(),
        results: [],
        isSearching: false,
        thumbnailCache: {},
        loadThumbnail: vi.fn(),
      }),
    }));

    vi.doMock('../../components/CanvasLayer', async () => {
      const ReactModule = await import('react');

      return {
        __esModule: true,
        default: ReactModule.forwardRef((_props, ref) => {
          ReactModule.useImperativeHandle(ref, () => ({
            startStreaming: vi.fn(async () => true),
            stopStreaming: vi.fn(),
            captureRegion: vi.fn(() => null),
            getArtifacts: vi.fn(() => ({ boxes: [], strokes: [] })),
            clearStrokes: vi.fn(),
          }));
          return <div data-testid="canvas-layer" />;
        }),
      };
    });

    vi.doMock('../../components/ControlHUD', () => ({
      __esModule: true,
      default: () => null,
    }));

    vi.doMock('../../components/SettingsModal', () => ({
      __esModule: true,
      default: (props: { isOpen: boolean; initialError?: string }) => (
        props.isOpen ? <div>{props.initialError}</div> : null
      ),
    }));

    vi.doMock('../../components/MindPalaceSidebar', () => ({
      __esModule: true,
      default: () => null,
    }));

    vi.doMock('../../components/MindPalace3DView', () => ({
      __esModule: true,
      default: () => null,
    }));

    const { default: App } = await import('../../App');
    render(<App />);

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(
      screen.getByText('Google rejected this API key or it does not have Gemini Live access. Check the key and try again.')
    ).toBeInTheDocument();
  });
});
