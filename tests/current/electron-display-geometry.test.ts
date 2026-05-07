/* @vitest-environment node */

import { describe, expect, test } from 'vitest';
import { getCaptureThumbnailSize, getOverlayWindowBounds, mapOverlayRegionToCaptureRegion } from '../../electron/display-geometry';

describe('Electron display geometry', () => {
  test('uses full display bounds for overlay sizing and screen capture thumbnails', () => {
    const display = {
      bounds: { x: 0, y: 0, width: 1728, height: 1117 },
      workArea: { x: 0, y: 25, width: 1728, height: 1067 },
    };

    expect(getOverlayWindowBounds(display)).toEqual(display.bounds);
    expect(getCaptureThumbnailSize(display)).toEqual({
      width: 1728,
      height: 1117,
    });
  });

  test('preserves the display origin instead of assuming the window starts at 0,0', () => {
    const display = {
      bounds: { x: -1440, y: 120, width: 1440, height: 900 },
    };

    expect(getOverlayWindowBounds(display)).toEqual({
      x: -1440,
      y: 120,
      width: 1440,
      height: 900,
    });
  });

  test('maps overlay-space regions into capture-space coordinates using the actual bitmap size', () => {
    const display = {
      bounds: { x: 0, y: 0, width: 1512, height: 982 },
    };

    expect(
      mapOverlayRegionToCaptureRegion(
        display,
        { x: 0, y: 0, width: 1512, height: 982 },
        { width: 1512, height: 982 },
        { width: 3024, height: 1964 },
        { x: 101, y: 53, width: 300, height: 200 },
      ),
    ).toEqual({
      x: 202,
      y: 106,
      width: 600,
      height: 400,
    });
  });

  test('accounts for overlay content being shifted below the menu bar', () => {
    const display = {
      bounds: { x: 0, y: 0, width: 1512, height: 982 },
    };

    expect(
      mapOverlayRegionToCaptureRegion(
        display,
        { x: 0, y: 37, width: 1512, height: 982 },
        { width: 1512, height: 982 },
        { width: 3024, height: 1964 },
        { x: 62, y: 743, width: 231, height: 119 },
      ),
    ).toEqual({
      x: 124,
      y: 1560,
      width: 462,
      height: 238,
    });
  });

  test('scales box coordinates from the renderer viewport into the actual overlay content bounds', () => {
    const display = {
      bounds: { x: 0, y: 0, width: 1512, height: 982 },
    };

    expect(
      mapOverlayRegionToCaptureRegion(
        display,
        { x: 0, y: 37, width: 1512, height: 982 },
        { width: 1512, height: 880 },
        { width: 3024, height: 1964 },
        { x: 62, y: 600, width: 231, height: 119 },
      ),
    ).toEqual({
      x: 124,
      y: 1413,
      width: 462,
      height: 266,
    });
  });
});
