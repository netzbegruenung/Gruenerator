/**
 * The Chat | Übersicht pill belongs to the notebook's start page. Once a
 * conversation runs, the page is a conversation and the pill is gone.
 *
 * The thread runs on the real assistant-ui runtime so the start-page /
 * conversation switch is the real one; the chat UI around it is stubbed.
 */
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test-utils';

let initialMessages: ThreadMessageLike[] = [];

vi.mock('@gruenerator/chat', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  function NotebookChatProvider({ children }: { children: ReactNode }) {
    const runtime = useLocalRuntime(
      {
        async *run() {
          yield { content: [] };
        },
      },
      { initialMessages }
    );
    return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
  }
  return {
    ...actual,
    NotebookChatProvider,
    NotebookComposer: () => null,
    UserMessage: () => null,
    AssistantMessage: () => null,
    CitationSidePanel: () => null,
  };
});
vi.mock('./NotebookStartpage', () => ({ NotebookStartpage: () => <p>Startseite</p> }));
vi.mock('./PendingQuestionSender', () => ({ PendingQuestionSender: () => null }));

const { NotebookPageContent } = await import('./NotebookPage');

const config = {
  id: 'test',
  title: 'Test',
  authTitle: 'Test',
  collectionType: 'multi' as const,
  collections: [{ id: 'test-collection', name: 'Test' }],
  startPageTitle: 'Test',
  placeholder: 'Frag',
  headerIcon: () => null,
  exampleQuestions: [],
};

const renderPage = (messages: ThreadMessageLike[]) => {
  initialMessages = messages;
  return renderWithProviders(
    <NotebookPageContent config={config} tabBar={<nav aria-label="Notebook-Bereiche" />} />
  );
};

describe('NotebookPageContent tab bar', () => {
  it('shows the tab bar on the start page', () => {
    renderPage([]);

    expect(screen.getByText('Startseite')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Notebook-Bereiche' })).toBeInTheDocument();
  });

  it('drops the tab bar once a conversation runs', () => {
    renderPage([
      { role: 'user', content: 'Was steht im Programm?' },
      { role: 'assistant', content: 'Eine Antwort.' },
    ]);

    expect(screen.queryByText('Startseite')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Notebook-Bereiche' })).not.toBeInTheDocument();
  });
});
