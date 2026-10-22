import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { getCanvasFormatOrDefault, isSlideFormat } from '../formats';
import { axe } from '../test-utils';

import { SlideNotesPanel } from './SlideNotesPanel';

// Die Bedingung, mit der CanvasEditor das Panel einhängt.
const showsPanel = (formatId: string) => isSlideFormat(getCanvasFormatOrDefault(formatId));

function Harness({ onState }: { onState: (s: { notes: string }) => void }) {
  const [state, setState] = useState({ notes: '' });
  return (
    <SlideNotesPanel
      value={state.notes}
      onChange={(notes) => {
        setState({ notes });
        onState({ notes });
      }}
    />
  );
}

describe('SlideNotesPanel', () => {
  it('is shown for slide formats only', () => {
    expect(showsPanel('slide-16-9')).toBe(true);
    expect(showsPanel('post-portrait')).toBe(false);
  });

  it('is collapsed by default', () => {
    render(<SlideNotesPanel value="" onChange={() => {}} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    const toggle = screen.getByRole('button', { name: /Notizen/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands on click and writes typing into the page state', async () => {
    const onState = vi.fn();
    render(<Harness onState={onState} />);
    await userEvent.click(screen.getByRole('button', { name: /Notizen/ }));
    expect(screen.getByRole('button', { name: /Notizen/ }).getAttribute('aria-expanded')).toBe(
      'true'
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Sprechernotizen' }), 'Hi');
    expect(onState).toHaveBeenLastCalledWith({ notes: 'Hi' });
  });

  it('shows an indicator when notes exist', () => {
    const { rerender } = render(<SlideNotesPanel value="" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Notizen' })).toBeTruthy();
    rerender(<SlideNotesPanel value="Text" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Notizen (1)' })).toBeTruthy();
  });

  it('has no axe violations, collapsed and expanded', async () => {
    const { container } = render(<SlideNotesPanel value="x" onChange={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('button', { name: /Notizen/ }));
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });
});
