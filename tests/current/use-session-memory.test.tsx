import { renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useSessionMemory } from '../../hooks/use-session-memory';

describe('useSessionMemory', () => {
  test('stores, retrieves, and summarizes turns', () => {
    const { result } = renderHook(() => useSessionMemory());

    result.current.addTurn('How many errors?', 'There are 3 errors.', []);
    result.current.addTurn('Show the button', 'The blue button is in the top bar.', [
      {
        type: 'focus-box',
        box: {
          id: 'box-1',
          x: 10,
          y: 20,
          width: 100,
          height: 40,
          createdAt: Date.now(),
        },
      },
    ]);

    expect(result.current.turnCount).toBe(2);
    expect(result.current.getRecentTurns(1)[0].modelText).toBe('The blue button is in the top bar.');
    expect(result.current.getRelevantTurns('button', 1)[0].userText).toBe('Show the button');
    expect(result.current.getContextSummary(2)).toContain('[Artifacts: focus-box]');

    result.current.clear();
    expect(result.current.turnCount).toBe(0);
  });
});
