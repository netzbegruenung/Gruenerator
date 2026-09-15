/**
 * #3160: die Badge war ein `<span role="button">` mit handgebautem
 * onKeyDown. Safari fokussiert nicht-Formularelemente bei Klick nicht,
 * wodurch der Fokus-Rückgabe-Pfad des Zitat-Dialogs (CitationModal.tsx) in
 * WebKit ins Leere lief. Ein natives `<button>` bekommt in jeder Engine
 * Fokus bei Klick.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import useCitationStore from '../../../stores/citationStore';
import { axe } from '../../../test-utils';

import CitationBadge from './CitationBadge';

const CITATION = {
  document_title: 'Grundsatzprogramm',
  cited_text: 'Ein Beispielzitat aus dem Programm.',
};

afterEach(() => {
  act(() => {
    useCitationStore.setState({
      selectedCitation: null,
      contextData: null,
      contextError: null,
      isLoadingContext: false,
    });
  });
});

describe('CitationBadge — natives Button-Element (#3160)', () => {
  it('rendert als <button>, nicht als span mit role=button', () => {
    render(<CitationBadge citationIndex="1" citation={CITATION} />);

    const badge = screen.getByRole('button', { name: /Citation 1/ });
    expect(badge.tagName).toBe('BUTTON');
  });

  it('setzt beim Klick das ausgewählte Zitat im Store', async () => {
    const user = userEvent.setup();
    render(<CitationBadge citationIndex="1" citation={CITATION} />);

    await user.click(screen.getByRole('button', { name: /Citation 1/ }));

    expect(useCitationStore.getState().selectedCitation).toEqual(CITATION);
  });

  it('erfüllt axe ohne Verstöße', async () => {
    const { container } = render(<CitationBadge citationIndex="1" citation={CITATION} />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
