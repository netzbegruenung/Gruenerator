import { useAgentStore, useUserProfileStore, type UserRole } from '@gruenerator/chat/stores';
import { getAgentSlug, getLandesverbandHubById } from '@gruenerator/shared/agents';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { landesverbandHubGroups } from '../../../features/chat/landesverbandHubCards';
import { axe, renderWithProviders } from '../../../test-utils';

import {
  buildRoleShortcuts,
  bundesgeschaeftsstelleShortcut,
  grueneJugendShortcut,
  landesverbandShortcut,
  mdbBueroShortcut,
  type RoleShortcut,
} from './roleShortcuts';
import { RoleShortcutsSidebarSection } from './RoleShortcutsSidebarSection';

const berlin = getLandesverbandHubById('berlin');
if (!berlin) throw new Error('Berlin-Hub fehlt in der Registry');

const lgsBerlin = {
  ebene: 'land',
  rolle: 'Mitarbeiter*in Landesgeschäftsstelle',
  bundesland: 'Berlin',
};
const gjVorOrt = {
  ebene: 'gruene-jugend',
  rolle: 'GRÜNE JUGEND vor Ort',
  bundesland: 'Bayern',
  gliederung: 'München',
};
const gjAt = { ebene: 'gruene-jugend', rolle: 'Bundesorganisation Grüne Jugend' };
const roles: UserRole[] = [{ ebene: 'kreisverband', rolle: 'Vorstand' }, lgsBerlin, gjVorOrt];

function renderSection(shortcuts: RoleShortcut[], collapsed = false) {
  const openRef = { current: false };
  const onNavigate = vi.fn();
  const view = renderWithProviders(
    <RoleShortcutsSidebarSection
      shortcuts={shortcuts}
      openRef={openRef}
      titleClass={collapsed ? 'sr-only' : ''}
      collapsed={collapsed}
      onNavigate={onNavigate}
      onClose={vi.fn()}
    />
  );
  return { ...view, openRef, onNavigate };
}

const lvShortcut = () => landesverbandShortcut(berlin, roles, 'de-DE', 'production');

beforeEach(() => {
  useUserProfileStore.getState().reset();
  useUserProfileStore.getState().hydrate({ roles, locale: 'de-DE', isHydrated: true });
  useAgentStore.setState({ selectedAgentId: 'gruenerator-oeffentlichkeitsarbeit-berlin' });
});

describe('RoleShortcutsSidebarSection — Landesverband', () => {
  it('names the trigger after the LV, also in the collapsed rail', () => {
    renderSection([lvShortcut()], true);
    expect(screen.getByRole('button', { name: berlin.name })).toBeInTheDocument();
  });

  it('starts a new chat with the LV role active', async () => {
    const user = userEvent.setup();
    const { onNavigate, openRef } = renderSection([lvShortcut()]);
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

  it('starts a new chat with an LV recipe and links notebook and Marktplatz', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderSection([lvShortcut()]);
    await user.click(screen.getByRole('button', { name: berlin.name }));

    const recipes = landesverbandHubGroups(berlin, 'production').flatMap((g) => g.recipes);
    // Jede LV-Familie hat ihr Rezept: PR (Partei, Fraktion, Insta), Bürger*innen,
    // Wahlprüfsteine, Beschluss, Wahlprogramm — kein Agent-Eintrag mehr.
    expect(recipes.map((r) => r.mention)).toEqual(
      expect.arrayContaining(['presse-berlin-partei', 'wahlpruefstein-berlin', 'buerger-berlin'])
    );
    const items = screen.getAllByRole('menuitem');
    // Rolle + ein Eintrag je Rezept + Notebook + Marktplatz.
    expect(items).toHaveLength(recipes.length + 3);
    expect(screen.getByRole('menuitem', { name: 'Notebook' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Alle Rezepte' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: recipes[0]!.title }));
    expect(onNavigate).toHaveBeenCalledWith(
      `/chat?rezept=${recipes[0]!.mention}`,
      recipes[0]!.title
    );
  });

  it('has no axe violations with the menu open', async () => {
    const user = userEvent.setup();
    renderSection([lvShortcut()]);
    await user.click(screen.getByRole('button', { name: berlin.name }));
    // Das Menü rendert in ein Portal am <body>; „region" würde hier nur die
    // fehlende Seiten-Landmark des Test-Rahmens melden.
    expect(
      await axe(document.body, { rules: { region: { enabled: false } } })
    ).toHaveNoViolations();
  });
});

describe('RoleShortcutsSidebarSection — Grüne Jugend', () => {
  it('offers nothing without a GJ role', () => {
    expect(grueneJugendShortcut([lgsBerlin], 'de-DE')).toBeNull();
  });

  it('prefers the GJ role of the own country', () => {
    expect(grueneJugendShortcut([gjAt, gjVorOrt], 'de-DE')?.role).toEqual(gjVorOrt);
    const at = grueneJugendShortcut([gjVorOrt, gjAt], 'de-AT');
    expect(at?.role).toEqual(gjAt);
    expect(at?.starters.links[0]?.path).toBe('/chat?rezept=gj-insta-at');
  });

  it('starts a GJ role chat, the GJ Insta recipe and links the GJ Sharepics', async () => {
    const user = userEvent.setup();
    const gj = grueneJugendShortcut(roles, 'de-DE')!;
    const { onNavigate } = renderSection([gj]);
    await user.click(screen.getByRole('button', { name: 'GRÜNE JUGEND' }));

    await user.click(screen.getByRole('menuitem', { name: 'Insta GRÜNE JUGEND' }));
    expect(onNavigate).toHaveBeenLastCalledWith('/chat?rezept=gj-insta', 'Insta GRÜNE JUGEND');

    await user.click(screen.getByRole('button', { name: 'GRÜNE JUGEND' }));
    await user.click(screen.getByRole('menuitem', { name: 'Sharepic-Vorlagen' }));
    expect(onNavigate).toHaveBeenLastCalledWith(
      expect.stringContaining('kollektion=gruene-jugend'),
      'Marktplatz'
    );

    await user.click(screen.getByRole('button', { name: 'GRÜNE JUGEND' }));
    await user.click(screen.getByRole('menuitem', { name: 'Neuer Chat mit deiner Rolle' }));
    expect(useUserProfileStore.getState().activeRole).toEqual({
      ebene: gjVorOrt.ebene,
      rolle: gjVorOrt.rolle,
    });
  });
});

const bgst = { ebene: 'bund', rolle: 'Mitarbeiter*in Bundesgeschäftsstelle' };
const mdbBuero = { ebene: 'bund', rolle: 'Mitarbeiter*in MdB-Büro', abgeordnete: 'Lisa Badum' };

describe('RoleShortcutsSidebarSection — Bundesgeschäftsstelle', () => {
  it('offers the five bgst recipes and the Bundesverband notebook on bgst', () => {
    const shortcut = bundesgeschaeftsstelleShortcut([bgst], 'bgst');
    expect(shortcut?.role).toEqual(bgst);
    expect(shortcut?.starters.links.map((l) => l.path)).toEqual([
      '/chat?rezept=beschlusslage',
      '/chat?rezept=rechtsstand',
      '/chat?rezept=sprechzettel',
      '/chat?rezept=leitantrag',
      '/chat?rezept=presse-beschluss',
    ]);
    expect(shortcut?.links.map((l) => l.key)).toEqual([
      'gruene-notebook',
      'wahlpruefsteine-notebook',
    ]);
  });

  it('offers nothing where the bgst recipes are not on offer', () => {
    expect(bundesgeschaeftsstelleShortcut([bgst], 'production')).toBeNull();
    expect(bundesgeschaeftsstelleShortcut([mdbBuero], 'bgst')).toBeNull();
  });

  it('starts a chat with a bgst recipe', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderSection([bundesgeschaeftsstelleShortcut([bgst], 'bgst')!]);
    await user.click(screen.getByRole('button', { name: 'Bundesgeschäftsstelle' }));
    await user.click(screen.getByRole('menuitem', { name: 'Beschlusslage' }));
    expect(onNavigate).toHaveBeenCalledWith('/chat?rezept=beschlusslage', 'Beschlusslage');
  });
});

describe('RoleShortcutsSidebarSection — MdB-Büro', () => {
  it('is named after the MP and offers the Bundestag agents and notebooks', () => {
    const shortcut = mdbBueroShortcut([mdbBuero], 'production');
    expect(shortcut?.name).toBe('Büro Lisa Badum');
    expect(shortcut?.starters.links.map((l) => l.key)).toEqual([
      'gruenerator-bundestag',
      'gruenerator-abgeordnetenwatch',
      'gruenerator-rede-schreiber',
      'gruenerator-buergerservice',
    ]);
    expect(shortcut?.links.map((l) => l.key)).toEqual([
      'bundestagsfraktion-notebook',
      'bundestag-dip-notebook',
    ]);
  });

  it('falls back to "MdB-Büro" without an MP and drops notebooks the instance hides', () => {
    const shortcut = mdbBueroShortcut([{ ...mdbBuero, abgeordnete: '' }], 'bgst');
    expect(shortcut?.name).toBe('MdB-Büro');
    // bgst blendet `parlamente` aus.
    expect(shortcut?.links).toEqual([]);
    expect(mdbBueroShortcut([bgst], 'production')).toBeNull();
  });

  it('opens the Abgeordnetenwatch agent', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderSection([mdbBueroShortcut([mdbBuero], 'production')!]);
    await user.click(screen.getByRole('button', { name: 'Büro Lisa Badum' }));
    await user.click(screen.getByRole('menuitem', { name: 'Abgeordnetenwatch' }));
    expect(onNavigate).toHaveBeenCalledWith(
      `/agents/${getAgentSlug('gruenerator-abgeordnetenwatch')}`,
      'Abgeordnetenwatch'
    );
  });
});

describe('buildRoleShortcuts', () => {
  it('orders LV, bgst, MdB-Büro and GJ entries', () => {
    expect(
      buildRoleShortcuts([...roles, bgst, mdbBuero], 'de-DE', 'local').map((s) => s.key)
    ).toEqual([berlin.slug, 'bundesgeschaeftsstelle', 'mdb-buero', 'gruene-jugend']);
  });

  it('lists the LV and the GJ entry, and skips roles switched off for the sidebar', () => {
    expect(buildRoleShortcuts(roles, 'de-DE', 'production').map((s) => s.key)).toEqual([
      berlin.slug,
      'gruene-jugend',
    ]);
    const hidden = roles.map((r) => (r === gjVorOrt ? { ...r, showInSidebar: false } : r));
    expect(buildRoleShortcuts(hidden, 'de-DE', 'production').map((s) => s.key)).toEqual([
      berlin.slug,
    ]);
  });
});
