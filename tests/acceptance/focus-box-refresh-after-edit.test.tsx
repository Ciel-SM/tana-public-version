import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
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

describe('acceptance: focus box edits refresh queued capture context', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      createMockContext() as unknown as CanvasRenderingContext2D
    );
  });

  test('moving and resizing a focus box each refresh the captured region', async () => {
    const captureRegion = vi.fn(async () => 'region-image');
    const onBoxCreated = vi.fn();
    vi.stubGlobal('tana', { captureRegion });
    (window as any).tana = { captureRegion };

    const ref = React.createRef<CanvasLayerHandle>();
    const { container } = render(
      <div style={{ width: 400, height: 300 }}>
        <CanvasLayer
          ref={ref}
          onFrameCapture={vi.fn()}
          onBoxCreated={onBoxCreated}
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
      fireEvent.mouseDown(host, { clientX: 40, clientY: 40 });
    });
    await act(async () => {
      fireEvent.mouseMove(host, { clientX: 140, clientY: 140 });
    });
    await act(async () => {
      fireEvent.mouseUp(host, { clientX: 140, clientY: 140 });
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.mouseMove(host, { clientX: 90, clientY: 90 });
    });
    await act(async () => {
      fireEvent.mouseDown(host, { clientX: 90, clientY: 90 });
    });
    await act(async () => {
      fireEvent.mouseMove(host, { clientX: 170, clientY: 160 });
    });
    await act(async () => {
      fireEvent.mouseUp(host, { clientX: 170, clientY: 160 });
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.mouseMove(host, { clientX: 220, clientY: 210 });
    });
    await act(async () => {
      fireEvent.mouseDown(host, { clientX: 220, clientY: 210 });
    });
    await act(async () => {
      fireEvent.mouseMove(host, { clientX: 280, clientY: 260 });
    });
    await act(async () => {
      fireEvent.mouseUp(host, { clientX: 280, clientY: 260 });
      await Promise.resolve();
    });

    expect(captureRegion).toHaveBeenNthCalledWith(1, 40, 40, 100, 100, 400, 300);
    expect(captureRegion).toHaveBeenNthCalledWith(2, 120, 110, 100, 100, 400, 300);
    expect(captureRegion).toHaveBeenNthCalledWith(3, 120, 110, 160, 150, 400, 300);
    expect(onBoxCreated).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 120, y: 110, width: 160, height: 150 }),
      'region-image'
    );
    expect(ref.current?.getArtifacts().boxes[0]).toMatchObject({ x: 120, y: 110, width: 160, height: 150 });
  });
});
