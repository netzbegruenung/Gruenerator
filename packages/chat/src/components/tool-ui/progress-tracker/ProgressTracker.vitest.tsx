import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressTracker } from './ProgressTracker';

import type { ProgressStep } from '../../../hooks/useChatGraphStream';

function step(over: Partial<ProgressStep> = {}): ProgressStep {
  return { stage: 'searching', label: 'Suche läuft', status: 'in-progress', ...over };
}

describe('ProgressTracker', () => {
  it('renders nothing for an empty step list', () => {
    const { container } = render(<ProgressTracker steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the active (in-progress) step label', () => {
    render(
      <ProgressTracker
        steps={[step({ status: 'completed', label: 'Fertig' }), step({ label: 'Recherche' })]}
      />
    );
    expect(screen.getByText('Recherche')).toBeInTheDocument();
  });

  it('prioritises a failed step over any in-progress one', () => {
    render(
      <ProgressTracker
        steps={[step({ label: 'Läuft noch' }), step({ status: 'failed', label: 'Fehlgeschlagen' })]}
      />
    );
    expect(screen.getByText('Fehlgeschlagen')).toBeInTheDocument();
    expect(screen.queryByText('Läuft noch')).not.toBeInTheDocument();
  });

  it('renders nothing when the last step is already completed', () => {
    const { container } = render(
      <ProgressTracker steps={[step({ status: 'completed', label: 'Alles erledigt' })]} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
