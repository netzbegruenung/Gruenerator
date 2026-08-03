import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressIndicator } from './ProgressIndicator';

import type { ChatProgress } from '../../hooks/useChatGraphStream';

function progress(over: Partial<ChatProgress> = {}): ChatProgress {
  return { stage: 'searching', message: 'Suche läuft', ...over };
}

describe('ProgressIndicator', () => {
  it('renders nothing while idle', () => {
    const { container } = render(<ProgressIndicator progress={progress({ stage: 'idle' })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing once complete', () => {
    const { container } = render(<ProgressIndicator progress={progress({ stage: 'complete' })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a direct intent even mid-stage', () => {
    const { container } = render(<ProgressIndicator progress={progress({ intent: 'direct' })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the message as bare shimmering text', () => {
    const { container } = render(
      <ProgressIndicator progress={progress({ message: 'Recherche läuft' })} />
    );
    expect(screen.getByText('Recherche läuft')).toBeInTheDocument();
    // The status line IS the shimmer. Anything that reads as a chip around it —
    // a tinted box, a rounded outline, an agent dot — is the pill #2213 removed
    // from the tool card and must not reappear here.
    expect(container.querySelector('.bg-primary\\/5')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="rounded"]')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('draws no chip for the image stage either', () => {
    const { container } = render(
      <ProgressIndicator
        progress={progress({ stage: 'generating_image', message: 'Bild entsteht' })}
      />
    );
    expect(screen.getByText('Bild entsteht')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('prefers the running retrieval step over the generic stage message', () => {
    render(
      <ProgressIndicator
        progress={progress({ message: 'Durchsuche Quellen…' })}
        toolStatus="Websuche „Klimageld“"
      />
    );
    expect(screen.getByText('Websuche „Klimageld“')).toBeInTheDocument();
    expect(screen.queryByText('Durchsuche Quellen…')).not.toBeInTheDocument();
  });

  it('still lets planner narration win over the retrieval step', () => {
    render(
      <ProgressIndicator
        progress={progress({ pendingNarration: ['Ich schaue kurz nach.'] })}
        toolStatus="Websuche „Klimageld“"
      />
    );
    expect(screen.getByText('Ich schaue kurz nach.')).toBeInTheDocument();
  });

  it('renders the error message as a plain span', () => {
    render(
      <ProgressIndicator
        progress={progress({ stage: 'error', message: 'Etwas ist schiefgelaufen' })}
      />
    );
    const msg = screen.getByText('Etwas ist schiefgelaufen');
    expect(msg.tagName).toBe('SPAN');
    expect(msg.className).toContain('text-error');
  });
});
