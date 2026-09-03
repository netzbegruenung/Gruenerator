/**
 * Der leise Evidenz-Hinweis unter der Antwort.
 *
 * Gemockt wird NUR `@assistant-ui/react` — die Naht zwischen Laufzeit und
 * Komponente. Alles darunter rendert echt, damit die deutsche Kopie und das
 * Markup dieser Datei geprüft sind und nicht die einer Attrappe. Die Nachricht
 * trägt bewusst keine Textteile: dann ist `showActions` falsch und die
 * Aktionsleiste bleibt aus dem Weg, ohne dass sie mitgemockt werden müsste.
 *
 * Die axe-Zusicherung ist die Aussage, dass der Absatz KEIN `role`/`aria-*`
 * braucht: er ist Fliesstext neben der Antwort, keine Statusmeldung.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

const h = vi.hoisted(() => ({
  message: {
    id: 'm1',
    role: 'assistant',
    content: [] as Array<{ type: string }>,
    status: { type: 'complete' },
    metadata: { custom: {} as Record<string, unknown> },
    createdAt: undefined as Date | undefined,
  },
  thread: { messages: [] as unknown[] },
}));

vi.mock('@assistant-ui/react', () => ({
  useAuiState: (selector: (s: unknown) => unknown) =>
    selector({ message: h.message, thread: h.thread }),
  useAui: () => ({ message: { reload: vi.fn() } }),
  MessagePrimitive: {
    Root: ({ children }: { children?: unknown }) => children ?? null,
    Parts: () => null,
    Error: () => null,
  },
  ErrorPrimitive: { Root: () => null, Message: () => null },
  ActionBarPrimitive: { Root: () => null },
}));

const { AssistantMessage } = await import('./AssistantMessage');

const EVIDENCE_MESSAGE =
  'Zu dieser Frage habe ich im Notebook wenig Passendes gefunden — bitte die angegebenen Quellen prüfen.';

function renderWith(
  custom: Record<string, unknown>,
  status: { type: string } = { type: 'complete' }
) {
  h.message.metadata = { custom };
  h.message.status = status;
  return render(<AssistantMessage />);
}

describe('AssistantMessage — evidenceWeak', () => {
  it('zeigt den Satz, den der Server geschickt hat', () => {
    renderWith({ evidenceWeak: EVIDENCE_MESSAGE });
    expect(screen.getByText(EVIDENCE_MESSAGE)).toBeInTheDocument();
  });

  it('zeigt nichts ohne das Feld', () => {
    renderWith({});
    expect(screen.queryByText(EVIDENCE_MESSAGE)).toBeNull();
  });

  it('zeigt den Satz nicht, solange die Antwort noch streamt', () => {
    // Der Server schickt `evidence_weak` direkt nach `search_complete`, also
    // noch vor dem ersten Token — ungegated stünde der Satz allein über einer
    // leeren Antwort.
    renderWith({ evidenceWeak: EVIDENCE_MESSAGE }, { type: 'running' });
    expect(screen.queryByText(EVIDENCE_MESSAGE)).toBeNull();
  });

  it('beanstandet axe nicht', async () => {
    const { container } = renderWith({ evidenceWeak: EVIDENCE_MESSAGE });
    expect(await axe(container)).toHaveNoViolations();
  });
});
