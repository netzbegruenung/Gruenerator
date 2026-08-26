import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../stores/chatConfigStore';
import { useAgentStore } from '../stores/chatStore';
import { useUserProfileStore } from '../stores/userProfileStore';

import { ActiveRoleSyncEffect } from './ActiveRoleSyncEffect';

/**
 * Die Rolle im Composer war reiner Sitzungszustand: sie lebt in den
 * Thread-Einstellungen, und die gibt es erst mit dem Thread. Wer im Entwurf
 * eine Rolle wählte und neu lud, stand wieder ohne da.
 */

const LGS = { ebene: 'land', rolle: 'Mitarbeiter*in Landesgeschäftsstelle' };
const KV = { ebene: 'kreis', rolle: 'Kreisverband' };

function draft() {
  useAgentStore.setState({
    currentThreadId: null,
    selectedAgentId: null,
    threadMode: 'chat',
    customRoleRef: null,
    customRoleName: null,
    customSystemPrompt: null,
    roleRefSource: 'load',
  });
}

beforeEach(() => {
  useUserProfileStore.getState().reset();
  useChatConfigStore.setState({ persistActiveRole: undefined });
  draft();
});

describe('ActiveRoleSyncEffect', () => {
  it('legt die gemerkte Rolle auf einen Entwurf', () => {
    useUserProfileStore.getState().hydrate({
      roles: [LGS, KV],
      activeRole: LGS,
      hasChosenRole: true,
      isHydrated: true,
    });

    render(<ActiveRoleSyncEffect />);

    const state = useAgentStore.getState();
    expect(state.threadMode).toBe('eigener');
    expect(state.customRoleRef).toEqual(LGS);
    // Herkunft mitschreiben: `loadThreadSettings` räumt diese Rolle wieder weg,
    // sobald ein Thread ohne eigene Rolle geöffnet wird.
    expect(state.roleRefSource).toBe('default');
  });

  it('wählt bei genau einer Rolle diese vor, auch ohne je getroffene Wahl', () => {
    useUserProfileStore.getState().hydrate({
      roles: [LGS],
      activeRole: null,
      hasChosenRole: false,
      isHydrated: true,
    });

    render(<ActiveRoleSyncEffect />);

    expect(useAgentStore.getState().customRoleRef).toEqual(LGS);
  });

  it('lässt die Vorauswahl abwählen — „Ohne Rolle" bleibt ohne Rolle', () => {
    useUserProfileStore.getState().hydrate({
      roles: [LGS],
      activeRole: null,
      hasChosenRole: true,
      isHydrated: true,
    });

    render(<ActiveRoleSyncEffect />);

    expect(useAgentStore.getState().threadMode).toBe('chat');
    expect(useAgentStore.getState().customRoleRef).toBeNull();
  });

  it('rät bei mehreren Rollen nichts', () => {
    useUserProfileStore.getState().hydrate({
      roles: [LGS, KV],
      activeRole: null,
      hasChosenRole: false,
      isHydrated: true,
    });

    render(<ActiveRoleSyncEffect />);

    expect(useAgentStore.getState().threadMode).toBe('chat');
  });

  it('rührt einen offenen Thread nicht an — der trägt seine eigene Rolle', () => {
    useUserProfileStore.getState().hydrate({
      roles: [LGS],
      activeRole: LGS,
      hasChosenRole: true,
      isHydrated: true,
    });
    useAgentStore.setState({ currentThreadId: 'thread-1' });

    render(<ActiveRoleSyncEffect />);

    expect(useAgentStore.getState().threadMode).toBe('chat');
  });

  it('hebelt einen gewählten Agenten nicht aus', () => {
    // Im Rollen-Modus geht `agentId: null` raus — die Rolle hier draufzulegen
    // hätte die Agentenwahl still verworfen.
    useUserProfileStore.getState().hydrate({
      roles: [LGS],
      activeRole: LGS,
      hasChosenRole: true,
      isHydrated: true,
    });
    useAgentStore.setState({ selectedAgentId: 'pressemitteilung' });

    render(<ActiveRoleSyncEffect />);

    expect(useAgentStore.getState().threadMode).toBe('chat');
  });

  it('überschreibt keine gerade getroffene Wahl', () => {
    useUserProfileStore.getState().hydrate({
      roles: [LGS, KV],
      activeRole: LGS,
      hasChosenRole: true,
      isHydrated: true,
    });
    useAgentStore.setState({ threadMode: 'eigener', customRoleRef: KV, customRoleName: KV.rolle });

    render(<ActiveRoleSyncEffect />);

    expect(useAgentStore.getState().customRoleRef).toEqual(KV);
  });

  it('legt eine inzwischen gelöschte Rolle nicht auf', () => {
    useUserProfileStore.getState().hydrate({
      roles: [KV],
      activeRole: LGS,
      hasChosenRole: true,
      isHydrated: true,
    });

    render(<ActiveRoleSyncEffect />);

    expect(useAgentStore.getState().threadMode).toBe('chat');
  });

  it('wartet auf die Hydration — sonst gilt jede Rolle kurz als gelöscht', () => {
    useUserProfileStore.getState().hydrate({
      roles: [],
      activeRole: LGS,
      hasChosenRole: true,
      isHydrated: false,
    });

    render(<ActiveRoleSyncEffect />);

    expect(useAgentStore.getState().threadMode).toBe('chat');
  });
});

describe('setActiveRole', () => {
  it('schreibt die Wahl in die Konto-Einstellungen', () => {
    const persistActiveRole = vi.fn();
    useChatConfigStore.setState({ persistActiveRole });

    useUserProfileStore.getState().setActiveRole(LGS);

    expect(persistActiveRole).toHaveBeenCalledWith(LGS);
    expect(useUserProfileStore.getState().hasChosenRole).toBe(true);
  });

  it('merkt „Ohne Rolle" als getroffene Wahl, nicht als fehlende', () => {
    const persistActiveRole = vi.fn();
    useChatConfigStore.setState({ persistActiveRole });

    useUserProfileStore.getState().setActiveRole(null);

    expect(persistActiveRole).toHaveBeenCalledWith(null);
    expect(useUserProfileStore.getState().hasChosenRole).toBe(true);
  });
});
