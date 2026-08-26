import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentStore } from './chatStore';
import { useUserProfileStore } from './userProfileStore';

import type { ChatApiClient } from '../context/ChatContext';

/**
 * Die Rolle eines Threads über einen Neuaufbau retten.
 *
 * Eine Katalogrolle bringt keinen Prompttext mehr mit — der ist parteiintern
 * und wird server-seitig aufgelöst. Die Thread-Einstellungen speicherten aber
 * nur `customSystemPrompt`: bei einer Rolle war das `null`, es wurde also nichts
 * gespeichert, und beim Wiederöffnen warf der Reset unten den Thread zurück in
 * den normalen Chat. Sichtbar blieb die Rolle nur, solange der localStorage des
 * Geräts sie hielt.
 */

const ROLE = { ebene: 'land', rolle: 'Mitarbeiter*in Landesgeschäftsstelle' };

function fakeClient(settings: Record<string, unknown> | 'notfound') {
  const patched: unknown[] = [];
  const client = {
    get: vi.fn(() => {
      if (settings === 'notfound') {
        return Promise.reject(Object.assign(new Error('not found'), { status: 404 }));
      }
      return Promise.resolve(settings);
    }),
    patch: vi.fn((_url: string, body: unknown) => {
      patched.push(body);
      return Promise.resolve({ success: true });
    }),
  } as unknown as ChatApiClient;
  return { client, patched };
}

beforeEach(() => {
  useUserProfileStore.getState().hydrate({ roles: [ROLE], isHydrated: true });
  useAgentStore.setState({
    currentThreadId: 'thread-1',
    threadMode: 'eigener',
    customSystemPrompt: null,
    customRoleRef: ROLE,
    customRoleName: ROLE.rolle,
    customEnabledTools: null,
  });
});

describe('saveThreadSettings', () => {
  it('schreibt die Rollen-Referenz mit — sonst speichert ein Rollen-Thread nichts', async () => {
    const { client, patched } = fakeClient({});

    await useAgentStore.getState().saveThreadSettings('thread-1', client);

    expect(patched).toEqual([
      { customSystemPrompt: null, customEnabledTools: null, roleRef: ROLE },
    ]);
  });
});

describe('roleRefSource', () => {
  // Der Effekt in `GrueneratorChatRuntime` schreibt nur, was die Person selbst
  // gewählt hat. Ohne diese Unterscheidung schriebe jeder Threadwechsel die
  // gerade geladene Rolle sofort wieder zurück.
  it('markiert eine selbst gewählte Rolle als `user`', () => {
    useAgentStore.setState({ roleRefSource: 'load' });

    useAgentStore.getState().setCustomRoleRef(ROLE);

    expect(useAgentStore.getState().roleRefSource).toBe('user');
  });

  it('markiert eine geladene Rolle als `load`', async () => {
    useAgentStore.setState({ roleRefSource: 'user' });
    const { client } = fakeClient({
      customSystemPrompt: null,
      customEnabledTools: null,
      roleRef: ROLE,
    });

    await useAgentStore.getState().loadThreadSettings('thread-1', client);

    expect(useAgentStore.getState().roleRefSource).toBe('load');
  });
});

describe('loadThreadSettings', () => {
  it('stellt Rolle und Modus aus der gespeicherten Referenz wieder her', async () => {
    useAgentStore.setState({ threadMode: 'chat', customRoleRef: null, customRoleName: null });
    const { client } = fakeClient({
      customSystemPrompt: null,
      customEnabledTools: null,
      roleRef: ROLE,
    });

    await useAgentStore.getState().loadThreadSettings('thread-1', client);

    const state = useAgentStore.getState();
    expect(state.threadMode).toBe('eigener');
    expect(state.customRoleRef).toEqual(ROLE);
    expect(state.customRoleName).toBe(ROLE.rolle);
  });

  it('wirft einen Rollen-Thread nicht mehr in den Chat-Modus zurück', async () => {
    // Der Reset prüfte nur `customSystemPrompt` — bei einer Katalogrolle immer
    // leer. Genau hier ging die Rolle beim Neuladen verloren.
    const { client } = fakeClient({
      customSystemPrompt: null,
      customEnabledTools: null,
      roleRef: ROLE,
    });

    await useAgentStore.getState().loadThreadSettings('thread-1', client);

    expect(useAgentStore.getState().threadMode).toBe('eigener');
  });

  it('räumt einen „eigenen" Thread ohne jede Einstellung weiterhin auf', async () => {
    useAgentStore.setState({ customRoleRef: null, customRoleName: null });
    const { client } = fakeClient('notfound');

    await useAgentStore.getState().loadThreadSettings('thread-1', client);

    const state = useAgentStore.getState();
    expect(state.threadMode).toBe('chat');
    expect(state.customRoleRef).toBeNull();
  });

  it('nimmt die Bezeichnung aus der Referenz, wenn die Rolle inzwischen gelöscht ist', async () => {
    useUserProfileStore.getState().hydrate({ roles: [], isHydrated: true });
    const { client } = fakeClient({
      customSystemPrompt: null,
      customEnabledTools: null,
      roleRef: ROLE,
    });

    await useAgentStore.getState().loadThreadSettings('thread-1', client);

    expect(useAgentStore.getState().customRoleName).toBe(ROLE.rolle);
  });
});

describe('Konto-Voreinstellung gegen Thread-Einstellung', () => {
  // Die Voreinstellung liegt auf dem Entwurf, bevor der Thread bekannt ist.
  // Öffnet man danach einen Chat, der nie eine Rolle hatte, muss sie weichen —
  // sonst erbt ein alter Chat eine Rolle, die er nie trug.
  it('räumt eine vorausgewählte Rolle weg, wenn der Thread keine hat (404)', async () => {
    useAgentStore.setState({ roleRefSource: 'default' });
    const { client } = fakeClient('notfound');

    await useAgentStore.getState().loadThreadSettings('thread-1', client);

    const state = useAgentStore.getState();
    expect(state.threadMode).toBe('chat');
    expect(state.customRoleRef).toBeNull();
  });

  it('lässt die eigene Rolle des Threads stehen', async () => {
    useAgentStore.setState({ roleRefSource: 'default' });
    const { client } = fakeClient({
      customSystemPrompt: null,
      customEnabledTools: null,
      roleRef: ROLE,
    });

    await useAgentStore.getState().loadThreadSettings('thread-1', client);

    expect(useAgentStore.getState().customRoleRef).toEqual(ROLE);
    expect(useAgentStore.getState().roleRefSource).toBe('load');
  });

  it('stellt den Modus einer frei eingetippten Rolle wieder her', async () => {
    // Die trägt keine Referenz, nur ihren erzeugten Prompttext. Ohne den Modus
    // war der Chip nach dem Neuladen weg und die Anfrage ging als normaler
    // Chat mitsamt `agentId` raus.
    useAgentStore.setState({ threadMode: 'chat', customRoleRef: null, customSystemPrompt: null });
    const { client } = fakeClient({
      customSystemPrompt: 'Du bist Pressesprecherin.',
      customEnabledTools: null,
      roleRef: null,
    });

    await useAgentStore.getState().loadThreadSettings('thread-1', client);

    expect(useAgentStore.getState().threadMode).toBe('eigener');
    expect(useAgentStore.getState().customSystemPrompt).toBe('Du bist Pressesprecherin.');
  });
});
