import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useToolState } from '../../hooks/use-tool-state';

describe('useToolState', () => {
  test('switches tools from global shortcuts', () => {
    const { result } = renderHook(() => useToolState());

    expect(result.current.activeTool).toBe('cursor');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    });
    expect(result.current.activeTool).toBe('focus-box');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    });
    expect(result.current.activeTool).toBe('laser-pointer');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.activeTool).toBe('cursor');
  });

  test('ignores shortcuts while typing into inputs', () => {
    const { result } = renderHook(() => useToolState());
    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
    });

    expect(result.current.activeTool).toBe('cursor');
    input.remove();
  });
});
