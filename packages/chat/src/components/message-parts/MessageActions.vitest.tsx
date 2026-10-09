/**
 * „Einfach erklären" erscheint nur, wo die Fläche es anbietet (Notebook-Seite)
 * UND die Antwort schon eine gespeicherte Zeile hat — das Explainable wird aus
 * dieser Zeile gebaut. Gemockt wird nur `@assistant-ui/react`.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ExplainableActionProvider } from '../../context/ExplainableActionContext';

const h = vi.hoisted(() => ({
  message: {
    id: 'm1',
    role: 'assistant',
    content: [] as Array<{ type: string }>,
    status: { type: 'complete' },
    metadata: { custom: {} as Record<string, unknown> },
    createdAt: undefined as Date | undefined,
    branchNumber: 1,
    branchCount: 1,
  },
  thread: { messages: [] as unknown[], capabilities: { reload: false, edit: false } },
}));

vi.mock('@assistant-ui/react', () => ({
  useAuiState: (selector: (s: unknown) => unknown) =>
    selector({ message: h.message, thread: h.thread }),
  useAui: () => ({ message: { reload: vi.fn() } }),
  ActionBarPrimitive: { FeedbackPositive: () => null, FeedbackNegative: () => null },
}));

const { MessageActions } = await import('./MessageActions');

const LABEL = 'Einfach erklären';

function renderWith(custom: Record<string, unknown>, offer: boolean | null) {
  h.message.metadata = { custom };
  const ui = <MessageActions content="Antwort" />;
  return render(
    offer === null ? ui : <ExplainableActionProvider value={offer}>{ui}</ExplainableActionProvider>
  );
}

describe('MessageActions — Einfach erklären', () => {
  it('shows the action on a persisted notebook answer', () => {
    renderWith({ persistedMessageId: 'row-1' }, true);
    const button = screen.getByRole('button', { name: LABEL });
    expect(button).toHaveAttribute(
      'title',
      'Einfach erklärt, mit Erklärbildern (kostet bis zu 1,5 Bäume)'
    );
  });

  it('hides it outside the notebook surface', () => {
    renderWith({ persistedMessageId: 'row-1' }, null);
    expect(screen.queryByRole('button', { name: LABEL })).toBeNull();
  });

  it('hides it when the surface does not offer it', () => {
    renderWith({ persistedMessageId: 'row-1' }, false);
    expect(screen.queryByRole('button', { name: LABEL })).toBeNull();
  });

  it('hides it until the answer is persisted', () => {
    renderWith({}, true);
    expect(screen.queryByRole('button', { name: LABEL })).toBeNull();
  });
});
