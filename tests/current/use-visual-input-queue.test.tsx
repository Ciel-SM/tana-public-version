import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useVisualInputQueue } from '../../hooks/use-visual-input-queue';
import { BoundingBox, ConnectionState } from '../../types';

const box = (id: string): BoundingBox => ({
  id,
  x: 10,
  y: 20,
  width: 100,
  height: 80,
  createdAt: 1,
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const advanceTick = async () => {
  vi.advanceTimersByTime(1000);
  await flush();
};

describe('useVisualInputQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('sends screenshots on every tick when no focus regions exist', async () => {
    const sendRealtimeImage = vi.fn();
    const sendTextContext = vi.fn();
    const captureScreenshotJpeg = vi
      .fn()
      .mockResolvedValueOnce('screen-1')
      .mockResolvedValueOnce('screen-2')
      .mockResolvedValueOnce('screen-3')
      .mockResolvedValueOnce('screen-4');

    vi.stubGlobal('tana', { captureScreenshotJpeg });

    renderHook(({ connectionState }) =>
      useVisualInputQueue(connectionState, sendRealtimeImage, sendTextContext), {
      initialProps: { connectionState: 'connected' as ConnectionState },
    });

    await act(async () => {
      await flush();
    });

    await act(async () => {
      await advanceTick();
      await advanceTick();
    });

    expect(sendRealtimeImage).toHaveBeenNthCalledWith(1, 'screen-1', 'image/jpeg');
    expect(sendRealtimeImage).toHaveBeenNthCalledWith(2, 'screen-2', 'image/jpeg');
    expect(sendRealtimeImage).toHaveBeenNthCalledWith(3, 'screen-3', 'image/jpeg');
    expect(sendTextContext).not.toHaveBeenCalled();
  });

  test('alternates screenshots and focus crops when one focus region exists', async () => {
    const sendRealtimeImage = vi.fn();
    const captureScreenshotJpeg = vi
      .fn()
      .mockResolvedValueOnce('screen-1')
      .mockResolvedValueOnce('screen-2')
      .mockResolvedValueOnce('screen-3');

    vi.stubGlobal('tana', { captureScreenshotJpeg });

    const { result } = renderHook(({ connectionState }) =>
      useVisualInputQueue(connectionState, sendRealtimeImage, vi.fn()), {
      initialProps: { connectionState: 'connected' as ConnectionState },
    });

    await act(async () => {
      await flush();
    });

    act(() => {
      result.current.upsertFocusRegion(box('focus-1'), 'focus-1-image');
    });

    await act(async () => {
      await advanceTick();
      await advanceTick();
      await advanceTick();
    });

    expect(sendRealtimeImage).toHaveBeenNthCalledWith(1, 'screen-1', 'image/jpeg');
    expect(sendRealtimeImage).toHaveBeenNthCalledWith(2, 'screen-2', 'image/jpeg');
    expect(sendRealtimeImage).toHaveBeenNthCalledWith(3, 'focus-1-image', 'image/png');
  });

  test('round-robins multiple focus regions fairly', async () => {
    const sendRealtimeImage = vi.fn();
    const captureScreenshotJpeg = vi
      .fn()
      .mockResolvedValueOnce('screen-1')
      .mockResolvedValueOnce('screen-2')
      .mockResolvedValueOnce('screen-3')
      .mockResolvedValueOnce('screen-4')
      .mockResolvedValueOnce('screen-5')
      .mockResolvedValueOnce('screen-6');

    vi.stubGlobal('tana', { captureScreenshotJpeg });

    const { result } = renderHook(({ connectionState }) =>
      useVisualInputQueue(connectionState, sendRealtimeImage, vi.fn()), {
      initialProps: { connectionState: 'connected' as ConnectionState },
    });

    await act(async () => {
      await flush();
    });

    act(() => {
      result.current.upsertFocusRegion(box('focus-1'), 'focus-1-image');
      result.current.upsertFocusRegion(box('focus-2'), 'focus-2-image');
    });

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

  test('replaces an existing focus entry on edit instead of duplicating it', async () => {
    const sendRealtimeImage = vi.fn();
    const captureScreenshotJpeg = vi
      .fn()
      .mockResolvedValueOnce('screen-1')
      .mockResolvedValueOnce('screen-2')
      .mockResolvedValueOnce('screen-3')
      .mockResolvedValueOnce('screen-4')
      .mockResolvedValueOnce('screen-5');

    vi.stubGlobal('tana', { captureScreenshotJpeg });

    const { result } = renderHook(({ connectionState }) =>
      useVisualInputQueue(connectionState, sendRealtimeImage, vi.fn()), {
      initialProps: { connectionState: 'connected' as ConnectionState },
    });

    await act(async () => {
      await flush();
    });

    act(() => {
      result.current.upsertFocusRegion(box('focus-1'), 'focus-old');
    });

    await act(async () => {
      await advanceTick();
      await advanceTick();
    });

    act(() => {
      result.current.upsertFocusRegion({ ...box('focus-1'), x: 30 }, 'focus-new');
    });

    await act(async () => {
      await advanceTick();
      await advanceTick();
    });

    expect(sendRealtimeImage.mock.calls).toEqual([
      ['screen-1', 'image/jpeg'],
      ['screen-2', 'image/jpeg'],
      ['focus-old', 'image/png'],
      ['screen-4', 'image/jpeg'],
      ['focus-new', 'image/png'],
    ]);
  });

  test('removes a focus entry from rotation', async () => {
    const sendRealtimeImage = vi.fn();
    const captureScreenshotJpeg = vi
      .fn()
      .mockResolvedValueOnce('screen-1')
      .mockResolvedValueOnce('screen-2')
      .mockResolvedValueOnce('screen-3')
      .mockResolvedValueOnce('screen-4');

    vi.stubGlobal('tana', { captureScreenshotJpeg });

    const { result } = renderHook(({ connectionState }) =>
      useVisualInputQueue(connectionState, sendRealtimeImage, vi.fn()), {
      initialProps: { connectionState: 'connected' as ConnectionState },
    });

    await act(async () => {
      await flush();
    });

    act(() => {
      result.current.upsertFocusRegion(box('focus-1'), 'focus-1-image');
      result.current.upsertFocusRegion(box('focus-2'), 'focus-2-image');
      result.current.removeFocusRegion('focus-1');
    });

    await act(async () => {
      await advanceTick();
      await advanceTick();
      await advanceTick();
    });

    expect(sendRealtimeImage.mock.calls).toEqual([
      ['screen-1', 'image/jpeg'],
      ['screen-2', 'image/jpeg'],
      ['focus-2-image', 'image/png'],
      ['screen-4', 'image/jpeg'],
    ]);
  });

  test('clears queue state and resets alternation on disconnect', async () => {
    const sendRealtimeImage = vi.fn();
    const captureScreenshotJpeg = vi
      .fn()
      .mockResolvedValueOnce('screen-1')
      .mockResolvedValueOnce('screen-2')
      .mockResolvedValueOnce('screen-3')
      .mockResolvedValueOnce('screen-4');

    vi.stubGlobal('tana', { captureScreenshotJpeg });

    const { result, rerender } = renderHook(({ connectionState }) =>
      useVisualInputQueue(connectionState, sendRealtimeImage, vi.fn()), {
      initialProps: { connectionState: 'connected' as ConnectionState },
    });

    await act(async () => {
      await flush();
    });

    act(() => {
      result.current.upsertFocusRegion(box('focus-1'), 'focus-1-image');
    });

    await act(async () => {
      await advanceTick();
      await advanceTick();
    });

    rerender({ connectionState: 'disconnected' as ConnectionState });
    rerender({ connectionState: 'connected' as ConnectionState });

    await act(async () => {
      await flush();
    });

    expect(sendRealtimeImage.mock.calls).toEqual([
      ['screen-1', 'image/jpeg'],
      ['screen-2', 'image/jpeg'],
      ['focus-1-image', 'image/png'],
      ['screen-4', 'image/jpeg'],
    ]);
  });

  test('preserves screenshot failure warning and recovery behavior', async () => {
    const sendRealtimeImage = vi.fn();
    const sendTextContext = vi.fn();
    const captureScreenshotJpeg = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('screen-4');

    vi.stubGlobal('tana', { captureScreenshotJpeg });

    renderHook(({ connectionState }) =>
      useVisualInputQueue(connectionState, sendRealtimeImage, sendTextContext), {
      initialProps: { connectionState: 'connected' as ConnectionState },
    });

    await act(async () => {
      await flush();
    });

    await act(async () => {
      await advanceTick();
      await advanceTick();
      await advanceTick();
    });

    expect(sendTextContext).toHaveBeenNthCalledWith(
      1,
      '[SYSTEM: Screen capture is currently unavailable. Do not describe or guess what is on the user\'s screen.]'
    );
    expect(sendTextContext).toHaveBeenNthCalledWith(
      2,
      '[SYSTEM: Screen capture restored. You can now see the user\'s screen.]'
    );
    expect(sendRealtimeImage).toHaveBeenCalledTimes(1);
    expect(sendRealtimeImage).toHaveBeenCalledWith('screen-4', 'image/jpeg');
  });
});
