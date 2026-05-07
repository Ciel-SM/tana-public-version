interface DisplayBoundsLike {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface SizeLike {
  width: number;
  height: number;
}

interface RectangleLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getOverlayWindowBounds(display: DisplayBoundsLike) {
  const { x, y, width, height } = display.bounds;
  return { x, y, width, height };
}

export function getCaptureThumbnailSize(display: DisplayBoundsLike) {
  const { width, height } = display.bounds;
  return { width, height };
}

export function mapOverlayRegionToCaptureRegion(
  display: DisplayBoundsLike,
  overlayContentBounds: RectangleLike,
  overlayViewportSize: SizeLike,
  captureSize: SizeLike,
  region: RectangleLike,
) {
  const displayWidth = Math.max(display.bounds.width, 1);
  const displayHeight = Math.max(display.bounds.height, 1);
  const overlayViewportWidth = Math.max(overlayViewportSize.width, 1);
  const overlayViewportHeight = Math.max(overlayViewportSize.height, 1);
  const captureWidth = Math.max(captureSize.width, 1);
  const captureHeight = Math.max(captureSize.height, 1);

  const scaleX = captureWidth / displayWidth;
  const scaleY = captureHeight / displayHeight;
  const viewportToContentScaleX = overlayContentBounds.width / overlayViewportWidth;
  const viewportToContentScaleY = overlayContentBounds.height / overlayViewportHeight;

  const displayRelativeRegionX =
    (overlayContentBounds.x - display.bounds.x) + (region.x * viewportToContentScaleX);
  const displayRelativeRegionY =
    (overlayContentBounds.y - display.bounds.y) + (region.y * viewportToContentScaleY);

  const x = clamp(Math.round(displayRelativeRegionX * scaleX), 0, captureWidth);
  const y = clamp(Math.round(displayRelativeRegionY * scaleY), 0, captureHeight);
  const maxWidth = Math.max(0, captureWidth - x);
  const maxHeight = Math.max(0, captureHeight - y);
  const width = clamp(
    Math.round(region.width * viewportToContentScaleX * scaleX),
    1,
    maxWidth,
  );
  const height = clamp(
    Math.round(region.height * viewportToContentScaleY * scaleY),
    1,
    maxHeight,
  );

  return { x, y, width, height };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
