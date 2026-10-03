/**
 * Ablehnen mit Begründung: die Strecke bis zum Modell („Vom Nutzer abgelehnt:
 * …", approvalResume) gab es schon, nur fragte die Karte nie danach.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import { ToolApprovalCard } from './ToolApprovalCard';

function renderCard() {
  const respondToApproval = vi.fn();
  const view = render(
    <ToolApprovalCard
      toolName="ma__create_form"
      args={{ title: 'Umfrage' }}
      approval={{ id: 'c1' }}
      serverName="Typeform"
      respondToApproval={respondToApproval}
    />
  );
  return { respondToApproval, ...view };
}

describe('ToolApprovalCard — ablehnen', () => {
  it('fragt nach einer Begründung und reicht sie weiter', async () => {
    const user = userEvent.setup();
    const { respondToApproval } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Ablehnen' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Begründung für die Ablehnung' }),
      '  Lieber nur einen Entwurf  '
    );
    await user.click(screen.getByRole('button', { name: 'Ablehnen' }));

    expect(respondToApproval).toHaveBeenCalledWith({
      approved: false,
      optionId: 'reject-once',
      reason: 'Lieber nur einen Entwurf',
    });
  });

  it('lehnt ohne Begründung ab, wenn das Feld leer bleibt', async () => {
    const user = userEvent.setup();
    const { respondToApproval } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Ablehnen' }));
    await user.click(screen.getByRole('button', { name: 'Ablehnen' }));

    expect(respondToApproval).toHaveBeenCalledWith({ approved: false, optionId: 'reject-once' });
  });

  it('kehrt mit Abbrechen zu den drei Optionen zurück, ohne zu antworten', async () => {
    const user = userEvent.setup();
    const { respondToApproval } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Ablehnen' }));
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(screen.getByRole('button', { name: /Einmal erlauben/ })).toBeTruthy();
    expect(respondToApproval).not.toHaveBeenCalled();
  });

  it('hat im Begründungsschritt keine a11y-Verstösse', async () => {
    const user = userEvent.setup();
    const { container } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Ablehnen' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
