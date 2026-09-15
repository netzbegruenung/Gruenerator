import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MemoryIndicator } from './MemoryIndicator';

import type { MemoryContextInfo } from '../../hooks/useChatGraphStream';

function memoryContext(over: Partial<MemoryContextInfo> = {}): MemoryContextInfo {
  return {
    memoryCount: 1,
    memories: [{ content: 'Mag Fahrrad', category: 'anweisung' }],
    isPersona: false,
    ...over,
  };
}

describe('MemoryIndicator', () => {
  it('renders nothing when there are no memories', () => {
    const { container } = render(
      <MemoryIndicator memoryContext={memoryContext({ memoryCount: 0, memories: [] })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('uses the persona label and singular count wording is skipped for persona', () => {
    render(<MemoryIndicator memoryContext={memoryContext({ isPersona: true, memoryCount: 1 })} />);
    expect(screen.getByText('Nutzerprofil berücksichtigt')).toBeInTheDocument();
  });

  it('pluralizes the count label for multiple non-persona memories', () => {
    render(
      <MemoryIndicator
        memoryContext={memoryContext({
          memoryCount: 2,
          memories: [
            { content: 'A', category: null },
            { content: 'B', category: null },
          ],
        })}
      />
    );
    expect(screen.getByText('2 Erinnerungen berücksichtigt')).toBeInTheDocument();
  });

  it('uses the singular label for exactly one memory', () => {
    render(<MemoryIndicator memoryContext={memoryContext({ memoryCount: 1 })} />);
    expect(screen.getByText('1 Erinnerung berücksichtigt')).toBeInTheDocument();
  });

  it('expands to show memory details on click, mapping known categories to German labels', async () => {
    const user = userEvent.setup();
    render(<MemoryIndicator memoryContext={memoryContext()} />);
    expect(screen.queryByText('Mag Fahrrad')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Mag Fahrrad')).toBeInTheDocument();
    expect(screen.getByText('Anweisung')).toBeInTheDocument();
  });

  it('falls back to the raw category string for an unknown category', async () => {
    const user = userEvent.setup();
    render(
      <MemoryIndicator
        memoryContext={memoryContext({ memories: [{ content: 'X', category: 'mystery' }] })}
      />
    );
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('mystery')).toBeInTheDocument();
  });

  it('does not expand details for a persona context even when clicked', async () => {
    const user = userEvent.setup();
    render(<MemoryIndicator memoryContext={memoryContext({ isPersona: true })} />);
    await user.click(screen.getByRole('button'));
    expect(screen.queryByText('Mag Fahrrad')).not.toBeInTheDocument();
  });
});
