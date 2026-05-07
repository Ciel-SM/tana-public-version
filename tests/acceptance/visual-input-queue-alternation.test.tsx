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

describe('acceptance: visual input queue alternation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('alternates screenshots with a single active focus region', async () => {
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
    });

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

  test('round-robins active focus regions and falls back to screenshots when no focus exists', async () => {
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
    });

    act(() => {
      result.current.removeFocusRegion('focus-1');
      result.current.removeFocusRegion('focus-2');
    });

    await act(async () => {
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
