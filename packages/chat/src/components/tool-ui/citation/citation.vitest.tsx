import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Citation } from './citation';

import type { SerializableCitation } from './schema';

function citation(over: Partial<SerializableCitation> = {}): SerializableCitation {
  return {
    id: 'c-1',
    href: 'https://example.org/quelle',
    title: 'Eine Quelle',
    snippet: 'Ein Auszug',
    ...over,
  };
}

describe('Citation', () => {
  it('renders the title and derives the domain from the href when none is given', () => {
    render(<Citation {...citation()} />);
    expect(screen.getByText('Eine Quelle')).toBeInTheDocument();
    expect(screen.getByText('example.org')).toBeInTheDocument();
  });

  it('uses the explicit domain over the href-derived one', () => {
    render(<Citation {...citation({ domain: 'custom.example' })} />);
    expect(screen.getByText('custom.example')).toBeInTheDocument();
  });

  it('calls onNavigate with the sanitized href in the default (card) variant', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<Citation {...citation()} onNavigate={onNavigate} />);
    await user.click(screen.getByRole('link'));
    expect(onNavigate).toHaveBeenCalledWith(
      'https://example.org/quelle',
      expect.objectContaining({ title: 'Eine Quelle' })
    );
  });

  it('renders no interactive link role when the href is unsafe (e.g. javascript:)', () => {
    render(<Citation {...citation({ href: 'javascript:alert(1)' })} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  // "inline" variant renders through @gruenerator/ui's Popover (Radix Slot);
  // the workspace currently has a nested react copy under
  // node_modules/@radix-ui/react-slot/node_modules/react, which trips
  // "Invalid hook call" for any Radix Slot consumer in this test lane. Skipped
  // pending a hoisting fix — see BUGS FOUND in the task report.
  it.skip('renders a compact chip with the accessible name set to the title in "inline" variant', () => {
    render(<Citation {...citation()} variant="inline" />);
    expect(screen.getByRole('button', { name: 'Eine Quelle' })).toBeInTheDocument();
  });

  it.skip('activates onNavigate from the inline chip on click', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<Citation {...citation()} variant="inline" onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button', { name: 'Eine Quelle' }));
    expect(onNavigate).toHaveBeenCalled();
  });
});
