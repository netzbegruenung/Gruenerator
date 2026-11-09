import { useAgentStore, useUserProfileStore } from '@gruenerator/chat/stores';
import { getLandesverbandHubById, getAgentSlug } from '@gruenerator/shared/agents';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../../test-utils';

import { LandesverbandSidebarSection } from './LandesverbandSidebarSection';

const berlin = getLandesverbandHubById('berlin');
if (!berlin) throw new Error('Berlin-Hub fehlt in der Registry');

const lgsBerlin = {
  ebene: 'land',
  rolle: 'Mitarbeiter*in Landesgeschäftsstelle',
  bundesland: 'Berlin',
};

function renderSection(onNavigate = vi.fn(), collapsed = false) {
  const openRef = { current: false };
  const view = renderWithProviders(
    <LandesverbandSidebarSection
      hubs={[berlin!]}
      openRef={openRef}
      titleClass={collapsed ? 'sr-only' : ''}
      collapsed={collapsed}
      onNavigate={onNavigate}
      onClose={vi.fn()}
    />
  );
  return { ...view, openRef, onNavigate };
}

beforeEach(() => {
  useUserProfileStore.getState().reset();
  useUserProfileStore.getState().hydrate({
    roles: [{ ebene: 'kreisverband', rolle: 'Vorstand' }, lgsBerlin],
    locale: 'de-DE',
    isHydrated: true,
  });
  useAgentStore.setState({ selectedAgentId: 'gruenerator-oeffentlichkeitsarbeit-berlin' });
});

describe('LandesverbandSidebarSection', () => {
  it('names the trigger after the LV, also in the collapsed rail', () => {
    renderSection(vi.fn(), true);
    expect(screen.getByRole('button', { name: berlin.name })).toBeInTheDocument();
  });

  it('starts a new chat with the LV role active', async () => {
    const user = userEvent.setup();
    const { onNavigate, openRef } = renderSection();
    await user.click(screen.getByRole('button', { name: berlin.name }));
    expect(openRef.current).toBe(true);

    await user.click(screen.getByRole('menuitem', { name: 'Neuer Chat mit deiner Rolle' }));

    expect(onNavigate).toHaveBeenCalledWith('/chat', 'Chat');
    expect(openRef.current).toBe(false);
    // Die LGS-Rolle — nicht die erste Rolle der Liste — ist jetzt aktiv …
    expect(useUserProfileStore.getState().activeRole).toEqual({
      ebene: lgsBerlin.ebene,
      rolle: lgsBerlin.rolle,
    });
    // … und liegt auf dem frischen Entwurf, ohne Agent.
    const chat = useAgentStore.getState();
    expect(chat.selectedAgentId).toBeNull();
    expect(chat.threadMode).toBe('eigener');
    expect(chat.customRoleRef).toEqual({ ebene: lgsBerlin.ebene, rolle: lgsBerlin.rolle });
    expect(chat.chatViewMode).toBe('overview');
  });

  it('starts a new chat with the chosen LV agent', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderSection();
    await user.click(screen.getByRole('button', { name: berlin.name }));

    const firstAgent = berlin.agentIds[0]!;
    const items = screen.getAllByRole('menuitem');
    // Rolle + ein Eintrag je Agent + Notebook.
    expect(items).toHaveLength(berlin.agentIds.length + 2);

    await user.click(items[1]!);
    expect(onNavigate).toHaveBeenCalledWith(
      `/agents/${getAgentSlug(firstAgent)}`,
      expect.any(String)
    );
  });

  it('links to the LV notebook instead of a separate hub entry', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole('button', { name: berlin.name }));
    expect(screen.getByRole('menuitem', { name: 'Notebook' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Alle Grüneratoren/ })).toBeNull();
  });

  it('has no axe violations with the menu open', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole('button', { name: berlin.name }));
    // Das Menü rendert in ein Portal am <body>; „region" würde hier nur die
    // fehlende Seiten-Landmark des Test-Rahmens melden.
    expect(
      await axe(document.body, { rules: { region: { enabled: false } } })
    ).toHaveNoViolations();
  });
});
