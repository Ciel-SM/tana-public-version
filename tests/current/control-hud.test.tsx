import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import ControlHUD from '../../components/ControlHUD';

describe('ControlHUD', () => {
  test('disables the connect button while the app is connecting', () => {
    const onConnect = vi.fn();

    render(
      <ControlHUD
        connectionState="connecting"
        isMicOn={false}
        onConnect={onConnect}
        onDisconnect={vi.fn()}
        onToggleMic={vi.fn()}
        messages={[]}
        activeTool="cursor"
        tools={[]}
        onToolChange={vi.fn()}
        suggestions={[]}
        suggestionsVisible={false}
        onSuggestionSelect={vi.fn()}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(onConnect).not.toHaveBeenCalled();
  });

  test('re-enables mouse capture when hovering the HUD while disconnected', () => {
    const setIgnoreMouseEvents = vi.fn();
    (window as any).tana = { setIgnoreMouseEvents };

    const { container, unmount } = render(
      <ControlHUD
        connectionState="disconnected"
        isMicOn={false}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onToggleMic={vi.fn()}
        messages={[]}
        activeTool="cursor"
        tools={[]}
        onToolChange={vi.fn()}
        suggestions={[]}
        suggestionsVisible={false}
        onSuggestionSelect={vi.fn()}
      />
    );

    fireEvent.mouseEnter(container.firstChild as HTMLElement);

    expect(setIgnoreMouseEvents).toHaveBeenCalledWith(false);

    unmount();
    delete (window as any).tana;
  });

  test('allows dragging the transcript panel during an active conversation', () => {
    render(
      <ControlHUD
        connectionState="connected"
        isMicOn={true}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onToggleMic={vi.fn()}
        messages={[
          { id: 'user-1', role: 'user', text: 'Hello there.', timestamp: new Date('2026-03-17T12:00:00Z') },
          { id: 'model-1', role: 'model', text: 'Hi, what would you like to do?', timestamp: new Date('2026-03-17T12:00:01Z') },
        ]}
        activeTool="cursor"
        tools={[]}
        onToolChange={vi.fn()}
        suggestions={[]}
        suggestionsVisible={false}
        onSuggestionSelect={vi.fn()}
      />
    );

    const panel = screen.getByTestId('transcript-panel');
    const handle = screen.getByTestId('transcript-drag-handle');

    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 100,
      top: 100,
      left: 100,
      right: 540,
      bottom: 300,
      width: 440,
      height: 200,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 160, clientY: 140 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 220, clientY: 190 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 220, clientY: 190 });

    expect(panel).toHaveStyle('transform: translate(60px, 50px)');
  });

  test('pins the transcript to the top edge when new messages would push it off-screen', async () => {
    const initialMessages = [
      { id: 'user-1', role: 'user' as const, text: 'Start speaking.', timestamp: new Date('2026-03-18T12:00:00Z') },
    ];
    const nextMessages = [
      ...initialMessages,
      { id: 'model-1', role: 'model' as const, text: 'Streaming reply line one.', timestamp: new Date('2026-03-18T12:00:01Z') },
      { id: 'model-2', role: 'model' as const, text: 'Streaming reply line two.', timestamp: new Date('2026-03-18T12:00:02Z') },
    ];

    const { rerender } = render(
      <ControlHUD
        connectionState="connected"
        isMicOn={true}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onToggleMic={vi.fn()}
        messages={initialMessages}
        activeTool="cursor"
        tools={[]}
        onToolChange={vi.fn()}
        suggestions={[]}
        suggestionsVisible={false}
        onSuggestionSelect={vi.fn()}
      />
    );

    const panel = screen.getByTestId('transcript-panel');
    const rects = [
      {
        x: 100,
        y: -24,
        top: -24,
        left: 100,
        right: 540,
        bottom: 236,
        width: 440,
        height: 260,
        toJSON: () => ({}),
      },
      {
        x: 100,
        y: 0,
        top: 0,
        left: 100,
        right: 540,
        bottom: 260,
        width: 440,
        height: 260,
        toJSON: () => ({}),
      },
    ];

    let rectIndex = 0;
    vi.spyOn(panel, 'getBoundingClientRect').mockImplementation(() => {
      const rect = rects[Math.min(rectIndex, rects.length - 1)];
      rectIndex += 1;
      return rect;
    });

    rerender(
      <ControlHUD
        connectionState="connected"
        isMicOn={true}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onToggleMic={vi.fn()}
        messages={nextMessages}
        activeTool="cursor"
        tools={[]}
        onToolChange={vi.fn()}
        suggestions={[]}
        suggestionsVisible={false}
        onSuggestionSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(panel).toHaveStyle('transform: translate(0px, 24px)');
    });
  });

  test('keeps the dragged transcript header anchored when collapsing and expanding', () => {
    render(
      <ControlHUD
        connectionState="connected"
        isMicOn={true}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onToggleMic={vi.fn()}
        messages={[
          { id: 'user-1', role: 'user', text: 'Hello there.', timestamp: new Date('2026-03-18T12:01:00Z') },
          { id: 'model-1', role: 'model', text: 'Here is a longer streaming reply.', timestamp: new Date('2026-03-18T12:01:01Z') },
        ]}
        activeTool="cursor"
        tools={[]}
        onToolChange={vi.fn()}
        suggestions={[]}
        suggestionsVisible={false}
        onSuggestionSelect={vi.fn()}
      />
    );

    const panel = screen.getByTestId('transcript-panel');
    const handle = screen.getByTestId('transcript-drag-handle');
    const toggleButton = within(panel).getByRole('button');

    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 100,
      top: 100,
      left: 100,
      right: 540,
      bottom: 300,
      width: 440,
      height: 200,
      toJSON: () => ({}),
    });
    vi.spyOn(handle, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 100,
      top: 100,
      left: 100,
      right: 540,
      bottom: 140,
      width: 440,
      height: 40,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 160, clientY: 140 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 220, clientY: 190 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 220, clientY: 190 });

    expect(panel).toHaveStyle('transform: translate(60px, 50px)');

    fireEvent.click(toggleButton);
    expect(panel).toHaveStyle('transform: translate(60px, -110px)');

    fireEvent.click(toggleButton);
    expect(panel).toHaveStyle('transform: translate(60px, 50px)');
  });

  test('keeps the original collapse behavior when the transcript was never dragged', () => {
    render(
      <ControlHUD
        connectionState="connected"
        isMicOn={true}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onToggleMic={vi.fn()}
        messages={[
          { id: 'user-1', role: 'user', text: 'Hello there.', timestamp: new Date('2026-03-18T12:02:00Z') },
          { id: 'model-1', role: 'model', text: 'Still docked to the HUD.', timestamp: new Date('2026-03-18T12:02:01Z') },
        ]}
        activeTool="cursor"
        tools={[]}
        onToolChange={vi.fn()}
        suggestions={[]}
        suggestionsVisible={false}
        onSuggestionSelect={vi.fn()}
      />
    );

    const panel = screen.getByTestId('transcript-panel');
    const toggleButton = within(panel).getByRole('button');

    fireEvent.click(toggleButton);

    expect(panel).toHaveStyle('transform: translate(0px, 0px)');
  });
});
