import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import SettingsModal from '../../components/SettingsModal';

describe('SettingsModal', () => {
  test('blocks obviously invalid API keys', () => {
    const onSave = vi.fn();

    render(
      <SettingsModal
        isOpen
        currentKey=""
        onSave={onSave}
        onClose={vi.fn()}
        isFirstRun
      />
    );

    fireEvent.change(screen.getByPlaceholderText('AIza...'), {
      target: { value: 'short-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));

    expect(screen.getByText("That doesn't look like a valid API key")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('saves a trimmed API key on enter', () => {
    const onSave = vi.fn();

    render(
      <SettingsModal
        isOpen
        currentKey=""
        onSave={onSave}
        onClose={vi.fn()}
        isFirstRun={false}
      />
    );

    const input = screen.getByPlaceholderText('AIza...');
    fireEvent.change(input, {
      target: { value: '  AIzaSy12345678901234567890  ' },
    });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSave).toHaveBeenCalledWith('AIzaSy12345678901234567890');
  });

  test('resets unsaved input to the latest persisted key when reopened', () => {
    const view = render(
      <SettingsModal
        isOpen
        currentKey="persisted-key"
        onSave={vi.fn()}
        onClose={vi.fn()}
        isFirstRun={false}
      />
    );

    const input = screen.getByPlaceholderText('AIza...');
    fireEvent.change(input, { target: { value: 'draft-unsaved-value' } });

    view.rerender(
      <SettingsModal
        isOpen={false}
        currentKey="persisted-key"
        onSave={vi.fn()}
        onClose={vi.fn()}
        isFirstRun={false}
      />
    );
    view.rerender(
      <SettingsModal
        isOpen
        currentKey="new-persisted-key"
        onSave={vi.fn()}
        onClose={vi.fn()}
        isFirstRun={false}
      />
    );

    expect(screen.getByPlaceholderText('AIza...')).toHaveValue('new-persisted-key');
  });
});
