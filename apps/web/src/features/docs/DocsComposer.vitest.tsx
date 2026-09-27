/**
 * The composer creates documents, and it also swallows questions. `detectChatIntent`
 * has flagged those for a while, but only inside the dropdown — a mouse user going
 * straight for the arrow button never saw the notice and got a document generated
 * out of their question. So the create is confirmed first, and the dialog is the
 * only place that decides which of the two happens.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocsComposer } from './DocsComposer';

import { renderWithProviders, screen, waitFor } from '@/test-utils';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
}));

const setPendingDraft = vi.fn();
vi.mock('@gruenerator/chat/stores', () => ({
  useAgentStore: { getState: () => ({ setPendingDraft }) },
}));

function setup(onGenerate = vi.fn()) {
  const { user } = renderWithProviders(
    <DocsComposer
      items={[]}
      templates={[]}
      featureIndex={[]}
      isGenerating={false}
      onGenerate={onGenerate}
      onSelectTemplate={vi.fn()}
      onImport={vi.fn()}
    />
  );
  return { onGenerate, user };
}

const QUESTION = 'Wie hoch ist der CO2-Preis im Jahr 2027?';

// `navigate` and `setPendingDraft` live at module scope — without this, a later
// case reads the previous case's calls.
beforeEach(() => vi.clearAllMocks());

describe('DocsComposer — Frage statt Auftrag', () => {
  it('asks before turning a question into a document', async () => {
    const { onGenerate, user } = setup();

    await user.type(screen.getByLabelText('Erstellen oder suchen'), QUESTION);
    await user.click(screen.getByRole('button', { name: 'Erstellen' }));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('hands the text to the chat as a draft, without sending it', async () => {
    const { onGenerate, user } = setup();

    await user.type(screen.getByLabelText('Erstellen oder suchen'), QUESTION);
    await user.click(screen.getByRole('button', { name: 'Erstellen' }));
    await user.click(await screen.findByRole('button', { name: 'Im Chat fragen' }));

    expect(setPendingDraft).toHaveBeenCalledWith(QUESTION);
    expect(navigate).toHaveBeenCalledWith('/chat');
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('still creates when the user insists', async () => {
    const { onGenerate, user } = setup();

    await user.type(screen.getByLabelText('Erstellen oder suchen'), QUESTION);
    await user.click(screen.getByRole('button', { name: 'Erstellen' }));
    await user.click(await screen.findByRole('button', { name: 'Trotzdem erstellen' }));

    expect(onGenerate).toHaveBeenCalledWith(expect.any(String), QUESTION);
    expect(navigate).not.toHaveBeenCalledWith('/chat');
  });

  // Radix focuses Cancel on open, and the dialog is reached by pressing Enter
  // in the composer — so the key that opened it must not also answer it.
  it('does nothing when Enter is pressed again right away', async () => {
    const { onGenerate, user } = setup();

    await user.type(screen.getByLabelText('Erstellen oder suchen'), QUESTION);
    await user.click(screen.getByRole('button', { name: 'Erstellen' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onGenerate).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalledWith('/chat');
  });

  it('leaves a plain create request alone', async () => {
    const { onGenerate, user } = setup();

    await user.type(
      screen.getByLabelText('Erstellen oder suchen'),
      'Erstelle ein Dokument zum Hitzeschutz'
    );
    await user.click(screen.getByRole('button', { name: 'Erstellen' }));

    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
