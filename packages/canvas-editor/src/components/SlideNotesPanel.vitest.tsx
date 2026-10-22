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

  it('writes typing into the page state', async () => {
    const onState = vi.fn();
    render(<Harness onState={onState} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Sprechernotizen' }), 'Hi');
    expect(onState).toHaveBeenLastCalledWith({ notes: 'Hi' });
  });

  it('has no axe violations, expanded and collapsed', async () => {
    const { container, unmount } = render(<SlideNotesPanel value="x" onChange={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
    unmount();
    const collapsed = render(<SlideNotesPanel value="x" onChange={() => {}} collapsible />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(await axe(collapsed.container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('button', { name: /Sprechernotizen/ }));
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});
