import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import CanvasLayer, { CanvasLayerHandle } from '../../components/CanvasLayer';

describe('acceptance: focus box bounds clamping', () => {
  test('keeps moved and resized focus boxes inside the visible canvas', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
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
    } as unknown as CanvasRenderingContext2D);

    const ref = React.createRef<CanvasLayerHandle>();
    const { container } = render(
      <div style={{ width: 400, height: 300 }}>
        <CanvasLayer
          ref={ref}
          onFrameCapture={vi.fn()}
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
    });

    let box = ref.current?.getArtifacts().boxes[0];
    expect(box).toMatchObject({ x: 50, y: 50, width: 100, height: 100 });

    await act(async () => {
      fireEvent.mouseMove(host, { clientX: 100, clientY: 100 });
    });
    await act(async () => {
      fireEvent.mouseDown(host, { clientX: 100, clientY: 100 });
    });
    await act(async () => {
      fireEvent.mouseMove(host, { clientX: 500, clientY: 400 });
    });
    await act(async () => {
      fireEvent.mouseUp(host, { clientX: 500, clientY: 400 });
    });

    box = ref.current?.getArtifacts().boxes[0];
    expect(box).toMatchObject({ x: 300, y: 200, width: 100, height: 100 });

    await act(async () => {
      fireEvent.mouseMove(host, { clientX: 400, clientY: 300 });
    });
    await act(async () => {
      fireEvent.mouseDown(host, { clientX: 400, clientY: 300 });
    });
    await act(async () => {
      fireEvent.mouseMove(host, { clientX: 460, clientY: 360 });
    });
    await act(async () => {
      fireEvent.mouseUp(host, { clientX: 460, clientY: 360 });
    });

    box = ref.current?.getArtifacts().boxes[0];
    expect(box).toMatchObject({ x: 300, y: 200, width: 100, height: 100 });
  });
});
