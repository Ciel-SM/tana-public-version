import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import SettingsPanel from '../../components/SettingsPanel';

const defaultProps = {
  isOpen: true,
  currentKey: 'AIzaSy12345678901234567890',
  currentVoiceName: 'Kore',
  onSaveApiKey: vi.fn(),
  onSaveVoiceName: vi.fn(),
  onClose: vi.fn(),
};

describe('SettingsPanel', () => {
  test('renders nothing when isOpen is false', () => {
    const { container } = render(
      <SettingsPanel {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  test('shows General nav item and API Key row when open', () => {
    render(<SettingsPanel {...defaultProps} />);
    // "General" appears in both the sidebar nav and the content heading
    expect(screen.getAllByText('General')).toHaveLength(2);
    expect(screen.getByText('API Key')).toBeInTheDocument();
    expect(screen.getAllByText('Voice Choice').length).toBeGreaterThan(0);
  });

  test('shows masked API key value', () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText('AIza...7890')).toBeInTheDocument();
  });

  test('clicking Change reveals the edit input', () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.queryByPlaceholderText('AIza...')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Change'));

    expect(screen.getByPlaceholderText('AIza...')).toBeInTheDocument();
  });

  test('validates empty input', () => {
    const onSaveApiKey = vi.fn();
    render(<SettingsPanel {...defaultProps} onSaveApiKey={onSaveApiKey} />);

    fireEvent.click(screen.getByText('Change'));
    // Clear the input
    fireEvent.change(screen.getByPlaceholderText('AIza...'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByText('Save'));

    expect(screen.getByText('API key is required')).toBeInTheDocument();
    expect(onSaveApiKey).not.toHaveBeenCalled();
  });

  test('validates short key (< 20 chars)', () => {
    const onSaveApiKey = vi.fn();
    render(<SettingsPanel {...defaultProps} onSaveApiKey={onSaveApiKey} />);

    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByPlaceholderText('AIza...'), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByText('Save'));

    expect(screen.getByText("That doesn't look like a valid API key")).toBeInTheDocument();
    expect(onSaveApiKey).not.toHaveBeenCalled();
  });

  test('saves valid key and collapses edit mode', () => {
    const onSaveApiKey = vi.fn();
    render(<SettingsPanel {...defaultProps} onSaveApiKey={onSaveApiKey} />);

    fireEvent.click(screen.getByText('Change'));
    fireEvent.change(screen.getByPlaceholderText('AIza...'), {
      target: { value: 'AIzaSyNewValidKey1234567890' },
    });
    fireEvent.click(screen.getByText('Save'));

    expect(onSaveApiKey).toHaveBeenCalledWith('AIzaSyNewValidKey1234567890');
    // Edit area should be collapsed — no input visible
    expect(screen.queryByPlaceholderText('AIza...')).not.toBeInTheDocument();
  });

  test('shows all saved voice choices for internal testing', () => {
    render(<SettingsPanel {...defaultProps} />);

    expect(screen.getByLabelText('Voice Choice').querySelectorAll('option')).toHaveLength(30);
  });

  test('groups single-persona styles into the Other tab', () => {
    render(<SettingsPanel {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Firm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Other' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Breezy' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Other' }));

    expect(screen.getByText('Aoede')).toBeInTheDocument();
    expect(screen.getByText('Breezy')).toBeInTheDocument();
    expect(screen.queryByText('Puck')).not.toBeInTheDocument();
  });

  test('saves the selected voice', () => {
    const onSaveVoiceName = vi.fn();

    render(
      <SettingsPanel
        {...defaultProps}
        onSaveVoiceName={onSaveVoiceName}
      />
    );

    fireEvent.change(screen.getByLabelText('Voice Choice'), { target: { value: 'Puck' } });
    fireEvent.click(screen.getByText('Save Voice'));

    expect(onSaveVoiceName).toHaveBeenCalledWith('Puck');
  });

  test('Escape key closes the panel', () => {
    const onClose = vi.fn();
    render(<SettingsPanel {...defaultProps} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });
});
