import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import SettingsModal from '../../components/SettingsModal';

describe('acceptance: SettingsModal state sync', () => {
  test('resets its input to the persisted key when reopened', () => {
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
