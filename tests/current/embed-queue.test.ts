import { describe, expect, test, vi } from 'vitest';
import { EmbedQueue } from '../../lib/mind-palace/embed-queue';

const frame = {
  screenshotBase64: 'screen-base64',
  focusRegions: [],
  timestamp: 1_700_000_000_000,
};

describe('EmbedQueue', () => {
  test('stops retrying after a credential error', async () => {
    const embedContent = vi.fn().mockRejectedValue(
      Object.assign(new Error('API key not valid. Please pass a valid API key.'), { status: 400 }),
    );
    const onStore = vi.fn();
    const onError = vi.fn();
    const queue = new EmbedQueue(
      { models: { embedContent } } as any,
      onStore,
      onError,
    );

    queue.enqueue(frame, 'hello');

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });

    expect(onStore).not.toHaveBeenCalled();
    expect(queue.pendingCount).toBe(0);

    queue.enqueue(frame, 'second try');
    await new Promise(resolve => setTimeout(resolve, 25));

    expect(embedContent).toHaveBeenCalledTimes(1);
  });

  test('dispose prevents stale async work from storing results', async () => {
    let resolveEmbed: ((value: unknown) => void) | null = null;
    const embedContent = vi.fn().mockImplementation(() => new Promise(resolve => {
      resolveEmbed = resolve;
    }));
    const onStore = vi.fn();
    const onError = vi.fn();
    const queue = new EmbedQueue(
      { models: { embedContent } } as any,
      onStore,
      onError,
    );

    queue.enqueue(frame, null);
    await vi.waitFor(() => {
      expect(embedContent).toHaveBeenCalledTimes(1);
    });

    queue.dispose();
    resolveEmbed?.({ embedding: { values: [1, 2, 3] } });
    await new Promise(resolve => setTimeout(resolve, 25));

    expect(onStore).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
