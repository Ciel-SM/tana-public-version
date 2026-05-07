import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useSuggestions } from '../../hooks/use-suggestions';
import { Message } from '../../types';

function makeMessage(id: string, role: Message['role'], text: string): Message {
  return {
    id,
    role,
    text,
    timestamp: new Date(),
  };
}

describe('useSuggestions', () => {
  test('builds heuristic follow-up chips from model output', () => {
    const { result } = renderHook(() => useSuggestions());
    const messages = [
      makeMessage('1', 'user', 'What is wrong here?'),
      makeMessage('2', 'user', 'Look at this import issue.'),
      makeMessage('3', 'model', 'There is an error in the import statement inside this function.'),
    ];

    act(() => {
      result.current.generateSuggestions(messages);
    });

    expect(result.current.visible).toBe(true);
    expect(result.current.suggestions.map((suggestion) => suggestion.text)).toEqual([
      'How do I fix this?',
      'Show me the issue',
      'How can I improve this?',
      'Compare with earlier',
    ]);
  });

  test('hides suggestions for very short model output', () => {
    const { result } = renderHook(() => useSuggestions());

    act(() => {
      result.current.generateSuggestions([
        makeMessage('1', 'model', 'Too short'),
      ]);
    });

    expect(result.current.visible).toBe(false);
    expect(result.current.suggestions).toEqual([]);
  });
});
