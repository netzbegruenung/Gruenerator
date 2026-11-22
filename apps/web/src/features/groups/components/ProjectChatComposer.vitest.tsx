import { useAgentStore } from '@gruenerator/chat';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { ProjectChatComposer } from './ProjectChatComposer';

function renderComposer(isPersonal = false) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/"
        element={
          <ProjectChatComposer groupId="g1" groupName="Wärmewende" isPersonal={isPersonal} />
        }
      />
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

  it('offers „Für das Team", on by default, in a team project', async () => {
    const { user, container } = renderComposer();
    const toggle = screen.getByRole('switch', { name: 'Für das Team' });
    expect(toggle).toBeChecked();
    expect(await axe(container)).toHaveNoViolations();

    await user.type(screen.getByRole('textbox'), 'Hallo{Enter}');
    expect(useAgentStore.getState().pendingGroup).toMatchObject({ id: 'g1', teamShared: true });
  });

  it('starts a private chat when the switch is turned off', async () => {
    const { user } = renderComposer();
    await user.click(screen.getByRole('switch', { name: 'Für das Team' }));
    await user.type(screen.getByRole('textbox'), 'Hallo{Enter}');
    expect(useAgentStore.getState().pendingGroup).toMatchObject({ id: 'g1', teamShared: false });
  });

  it('has no switch in a personal project and never asks for a team chat', async () => {
    const { user } = renderComposer(true);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), 'Hallo{Enter}');
    expect(useAgentStore.getState().pendingGroup).toMatchObject({ id: 'g1', teamShared: false });
  });

  it('starts with the default agent, not the one picked in another thread (#5676)', async () => {
    useAgentStore.setState({ selectedAgentId: 'gruene-jugend-vor-ort', pinnedConnector: null });
    const { user } = renderComposer();
    await user.type(screen.getByRole('textbox'), 'Hallo{Enter}');
    expect(useAgentStore.getState().selectedAgentId).toBeNull();
    expect(useAgentStore.getState().pendingMessage).toBe('Hallo');
  });
});

describe('ProjectChatComposer start questions', () => {
  beforeEach(() => {
    useAgentStore.setState({ pendingMessage: null, pendingGroup: null });
  });

  it('shows the welcome and starts a project chat with a clicked question', async () => {
    const { user } = renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={
            <ProjectChatComposer
              groupId="g1"
              groupName="Wärmewende"
              welcomeMessage="Willkommen im Projekt!"
              startQuestions={['Fasse die Förderung zusammen', 'Was ist neu?']}
            />
          }
        />
        <Route path="/chat" element={<p>Chat-Seite</p>} />
      </Routes>
    );
    expect(screen.getByText('Willkommen im Projekt!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Was ist neu?' }));

    expect(useAgentStore.getState().pendingMessage).toBe('Was ist neu?');
    expect(useAgentStore.getState().pendingGroup).toMatchObject({ id: 'g1', teamShared: true });
    expect(await screen.findByText('Chat-Seite')).toBeInTheDocument();
  });

  it('renders no start block without welcome or questions', () => {
    renderComposer();
    expect(screen.queryByRole('region', { name: 'Start in Wärmewende' })).toBeNull();
  });
});
