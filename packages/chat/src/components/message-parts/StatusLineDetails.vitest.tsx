import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { StatusLineDetails } from './StatusLineDetails';

import type { SerializableCitation } from '../tool-ui/citation/schema';

const label = <span>Websuche „Klimageld“</span>;

const source: SerializableCitation = {
  id: 'c1',
  href: 'https://gruene.de/klimageld',
  title: 'Klimageld',
  snippet: 'Ein Instrument …',
  domain: 'gruene.de',
  type: 'webpage',
};

describe('StatusLineDetails', () => {
  it('renders the bare label when there is nothing to drop down to', () => {
    render(
      <StatusLineDetails reasoningText={null} sources={[]}>
        {label}
      </StatusLineDetails>
    );
    expect(screen.getByText('Websuche „Klimageld“')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers a collapsed, labelled toggle once thinking exists', () => {
    render(
      <StatusLineDetails reasoningText="Ich prüfe die Zahlen." sources={[]}>
        {label}
      </StatusLineDetails>
    );
    const toggle = screen.getByRole('button', { name: 'Details anzeigen' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Ich prüfe die Zahlen.')).not.toBeInTheDocument();
  });

  it('reveals the thinking on click and points the toggle at its panel', async () => {
    const user = userEvent.setup();
    render(
      <StatusLineDetails reasoningText="Ich prüfe die Zahlen." sources={[]}>
        {label}
      </StatusLineDetails>
    );
    await user.click(screen.getByRole('button', { name: 'Details anzeigen' }));

    const toggle = screen.getByRole('button', { name: 'Details ausblenden' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Grünerators Gedanken')).toBeInTheDocument();
    expect(screen.getByText('Ich prüfe die Zahlen.')).toBeInTheDocument();

    const panelId = toggle.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId as string)).toBeInTheDocument();
  });

  it('opens for sources alone and counts them', async () => {
    const user = userEvent.setup();
    render(
      <StatusLineDetails reasoningText={null} sources={[source]}>
        {label}
      </StatusLineDetails>
    );
    await user.click(screen.getByRole('button', { name: 'Details anzeigen' }));
    expect(screen.getByText('Gefundene Quellen (1)')).toBeInTheDocument();
    expect(screen.queryByText('Grünerators Gedanken')).not.toBeInTheDocument();
  });

  it('keeps the label visible whether open or closed', async () => {
    const user = userEvent.setup();
    render(
      <StatusLineDetails reasoningText="Denke…" sources={[source]}>
        {label}
      </StatusLineDetails>
    );
    expect(screen.getByText('Websuche „Klimageld“')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Details anzeigen' }));
    expect(screen.getByText('Websuche „Klimageld“')).toBeInTheDocument();
  });
});
