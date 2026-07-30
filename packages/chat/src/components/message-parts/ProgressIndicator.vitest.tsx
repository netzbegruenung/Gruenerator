import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressIndicator } from './ProgressIndicator';

import type { ChatProgress } from '../../hooks/useChatGraphStream';

function progress(over: Partial<ChatProgress> = {}): ChatProgress {
  return { stage: 'searching', message: 'Suche läuft', ...over };
}

describe('ProgressIndicator', () => {
  it('renders nothing while idle', () => {
    const { container } = render(
      <ProgressIndicator progress={progress({ stage: 'idle' })} agentColor="#000" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing once complete', () => {
    const { container } = render(
      <ProgressIndicator progress={progress({ stage: 'complete' })} agentColor="#000" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a direct intent even mid-stage', () => {
    const { container } = render(
      <ProgressIndicator progress={progress({ intent: 'direct' })} agentColor="#000" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the message text in the default "box" variant', () => {
    render(
      <ProgressIndicator progress={progress({ message: 'Recherche läuft' })} agentColor="#0a0" />
    );
    expect(screen.getByText('Recherche läuft')).toBeInTheDocument();
  });

  it('prefers the running retrieval step over the generic stage message', () => {
    render(
      <ProgressIndicator
        progress={progress({ message: 'Durchsuche Quellen…' })}
        agentColor="#0a0"
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
        agentColor="#0a0"
        toolStatus="Websuche „Klimageld“"
      />
    );
    expect(screen.getByText('Ich schaue kurz nach.')).toBeInTheDocument();
  });

  it('renders the error message with error styling in "box" variant', () => {
    render(
      <ProgressIndicator
        progress={progress({ stage: 'error', message: 'Etwas ist schiefgelaufen' })}
        agentColor="#0a0"
      />
    );
    const msg = screen.getByText('Etwas ist schiefgelaufen');
    expect(msg).toBeInTheDocument();
    expect(msg.closest('div')?.className).toContain('bg-error-bg');
  });

  it('renders shimmering plain text (no box) in "plain" variant', () => {
    const { container } = render(
      <ProgressIndicator
        progress={progress({ message: 'Nur Text' })}
        agentColor="#0a0"
        variant="plain"
      />
    );
    expect(screen.getByText('Nur Text')).toBeInTheDocument();
    // No box wrapper — plain variant renders a bare span, not the rounded pill div.
    expect(container.querySelector('.bg-primary\\/5')).not.toBeInTheDocument();
  });

  it('renders the error message as a plain span in "plain" variant', () => {
    render(
      <ProgressIndicator
        progress={progress({ stage: 'error', message: 'Fehler' })}
        agentColor="#0a0"
        variant="plain"
      />
    );
    const msg = screen.getByText('Fehler');
    expect(msg.tagName).toBe('SPAN');
    expect(msg.className).toContain('text-error');
  });
});
