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

describe('CanvasLayer render loop lifecycle', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      createMockContext() as unknown as CanvasRenderingContext2D
    );
  });

  test('only schedules frames while streaming is active', async () => {
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

    act(() => {
      frameCallbacks.get(1)?.(performance.now());
    });

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(2);

    act(() => {
      ref.current?.stopStreaming();
    });

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(2);
    expect(frameCallbacks.has(2)).toBe(false);
  });
});
