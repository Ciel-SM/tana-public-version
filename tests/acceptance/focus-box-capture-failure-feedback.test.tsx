import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('acceptance: focus box capture failure feedback', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('the transcript explains that a failed focus capture was removed and not sent', async () => {
    vi.stubGlobal('tana', {
      setIgnoreMouseEvents: vi.fn(),
    });

    vi.doMock('../../hooks/use-live-api', async () => {
      const ReactModule = await import('react');

      return {
        useLiveApi: () => {
          const [messages, setMessages] = ReactModule.useState([]);

          return {
            connect: vi.fn(),
            disconnect: vi.fn(),
            connectionState: 'connected' as const,
            messages,
            startMic: vi.fn(),
            stopMic: vi.fn(),
            isMicOn: true,
            sendRealtimeImage: vi.fn(),
            sendTextContext: vi.fn(),
            appendSystemMessage: (text: string) => {
              setMessages(prev => [...prev, {
                id: String(prev.length + 1),
                role: 'system' as const,
                text,
                timestamp: new Date(),
              }]);
            },
          };
        },
      };
    });

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

    vi.doMock('../../hooks/use-visual-input-queue', () => ({
      useVisualInputQueue: () => ({
        upsertFocusRegion: vi.fn(),
        removeFocusRegion: vi.fn(),
        clear: vi.fn(),
      }),
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
          <button
            type="button"
            data-testid="fail-focus-box"
            onClick={() => props.onBoxCaptureFailed?.({ id: 'focus-1', x: 10, y: 10, width: 100, height: 80, createdAt: 1 })}
          >
            Fail focus box
          </button>
        );
      }),
    }));

    const { default: App } = await import('../../App');
    render(<App />);

    fireEvent.click(screen.getByTestId('fail-focus-box'));

    expect(
      screen.getByText('Focus region capture failed, so the box was removed and nothing was sent. Try drawing it again.')
    ).toBeInTheDocument();
  });
});
