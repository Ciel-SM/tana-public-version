import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import CanvasLayer, { CanvasLayerHandle } from '../../components/CanvasLayer';

const createMockContext = () => ({
  clearRect: vi.fn(),
  scale: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  rect: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  quadraticCurveTo: vi.fn(),
  fillRect: vi.fn(),
  setLineDash: vi.fn(),
});

describe('acceptance: CanvasLayer render loop', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      createMockContext() as unknown as CanvasRenderingContext2D
    );
  });

  test('stays idle until streaming starts and only creates one animation loop per activation', async () => {
    let nextFrameId = 0;
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        const id = ++nextFrameId;
        frameCallbacks.set(id, callback);
        return id;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((id: number) => {
        frameCallbacks.delete(id);
      });

    const ref = React.createRef<CanvasLayerHandle>();

    render(
      <CanvasLayer
        ref={ref}
        onFrameCapture={vi.fn()}
        isStreaming={false}
        activeTool="focus-box"
      />
    );

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

    await act(async () => {
      await ref.current?.startStreaming();
    });

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await ref.current?.startStreaming();
    });

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);

    const firstFrame = frameCallbacks.get(1);
    expect(firstFrame).toBeDefined();

    act(() => {
      firstFrame?.(performance.now());
    });

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(2);

    act(() => {
      ref.current?.stopStreaming();
    });

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(2);

    const scheduledCallsBeforeIdleFrame = requestAnimationFrameSpy.mock.calls.length;
    const idleFrame = frameCallbacks.get(2);
    expect(idleFrame).toBeUndefined();

    act(() => {
      frameCallbacks.forEach(callback => callback(performance.now()));
    });

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(scheduledCallsBeforeIdleFrame);
  });
});
