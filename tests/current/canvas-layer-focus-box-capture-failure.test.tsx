import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
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

describe('CanvasLayer focus box capture failures', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      createMockContext() as unknown as CanvasRenderingContext2D
    );
  });

  test.each([
    ['returns null', vi.fn(async () => null)],
    ['throws', vi.fn(async () => { throw new Error('capture failed'); })],
  ])('removes the box and notifies the app when capture %s', async (_label, captureRegion) => {
    const onBoxCreated = vi.fn();
    const onBoxCaptureFailed = vi.fn();
    vi.stubGlobal('tana', { captureRegion });
    (window as any).tana = { captureRegion };

    const ref = React.createRef<CanvasLayerHandle>();
    const { container } = render(
      <div style={{ width: 400, height: 300 }}>
        <CanvasLayer
          ref={ref}
          onFrameCapture={vi.fn()}
          onBoxCreated={onBoxCreated}
          onBoxCaptureFailed={onBoxCaptureFailed}
          isStreaming={false}
          activeTool="focus-box"
        />
      </div>
    );

    const host = container.firstElementChild?.firstElementChild as HTMLDivElement;
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 300,
      right: 400,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    });

    await act(async () => {
      await ref.current?.startStreaming();
    });

    await act(async () => {
      fireEvent.mouseDown(host, { clientX: 50, clientY: 50 });
    });
    await act(async () => {
      fireEvent.mouseMove(host, { clientX: 150, clientY: 150 });
    });
    await act(async () => {
      fireEvent.mouseUp(host, { clientX: 150, clientY: 150 });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onBoxCaptureFailed).toHaveBeenCalledWith(
        expect.objectContaining({ x: 50, y: 50, width: 100, height: 100 })
      );
    });

    expect(onBoxCreated).not.toHaveBeenCalled();
    expect(ref.current?.getArtifacts().boxes).toEqual([]);
  });
});
