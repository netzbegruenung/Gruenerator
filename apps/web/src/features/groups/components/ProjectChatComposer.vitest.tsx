import { useAgentStore } from '@gruenerator/chat';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { ProjectChatComposer } from './ProjectChatComposer';

function renderComposer() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<ProjectChatComposer groupId="g1" groupName="Wärmewende" />} />
      <Route path="/chat" element={<p>Chat-Seite</p>} />
    </Routes>
  );
}

describe('ProjectChatComposer', () => {
  beforeEach(() => {
    useAgentStore.setState({ pendingMessage: null, pendingGroup: null });
  });

  it('hands the first message and the project to the chat, then opens it', async () => {
    const { user, container } = renderComposer();
    expect(await axe(container)).toHaveNoViolations();

    await user.type(
      screen.getByRole('textbox', { name: 'Neuer Chat in Wärmewende' }),
      'Fasse die Förderung zusammen{Enter}'
    );

    expect(useAgentStore.getState().pendingMessage).toBe('Fasse die Förderung zusammen');
    expect(useAgentStore.getState().pendingGroup?.id).toBe('g1');
    expect(await screen.findByText('Chat-Seite')).toBeInTheDocument();
  });

  it('does nothing for an empty message', async () => {
    const { user } = renderComposer();
    expect(screen.getByRole('button', { name: 'Chat im Projekt starten' })).toBeDisabled();
    await user.type(screen.getByRole('textbox'), '   {Enter}');
    expect(useAgentStore.getState().pendingMessage).toBeNull();
    expect(useAgentStore.getState().pendingGroup).toBeNull();
  });
});
