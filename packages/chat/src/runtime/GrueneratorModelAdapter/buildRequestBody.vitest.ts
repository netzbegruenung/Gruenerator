/**
 * Der Rollen-Dreiklang reist nur im Modus `eigener`.
 *
 * `customSystemPrompt`, `roleName` und `roleRef` gehören zusammen. Standen sie
 * getrennt — der Prompt im gemeinsamen Rumpf, die Referenz nur im
 * `eigener`-Zweig —, konnte der Prompttext einer frei getippten Rolle nach dem
 * Wechsel zurück auf „Chat" weiterlaufen, während `roleRef` fehlte. Genau diese
 * Kombination lässt serverseitig `roleBausteinActive` auf false und legte damit
 * die Rezept-Automatik still (#2929 zusammen mit #2928).
 *
 * Run with: pnpm --filter @gruenerator/chat test
 */

import { describe, it, expect, vi } from 'vitest';

import { buildRequestBody, type BuildRequestBodyParams } from './buildRequestBody';

vi.mock('../../stores/chatConfigStore', () => ({
  useChatConfigStore: { getState: () => ({ platform: 'web' }) },
}));
vi.mock('../../stores/lastComputeStore', () => ({
  useLastComputeStore: { getState: () => ({ result: null }) },
}));
vi.mock('../clientTools', () => ({ getAvailableClientTools: () => [] }));

const ROLE = { ebene: 'landesverband', rolle: 'Mitarbeiter*in Landesgeschäftsstelle' };

function build(overrides: {
  effectiveMode: BuildRequestBodyParams['effectiveMode'];
  customSystemPrompt?: string | null;
  customRoleName?: string | null;
  customRoleRef?: typeof ROLE | null;
}): Record<string, unknown> {
  return buildRequestBody({
    effectiveMode: overrides.effectiveMode,
    formattedMessages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Moin' }] }],
    config: {
      threadId: 'e4d1c0aa-0000-4000-8000-000000000001',
      customSystemPrompt: overrides.customSystemPrompt ?? null,
      customRoleName: overrides.customRoleName ?? null,
      customRoleRef: overrides.customRoleRef ?? null,
    } as unknown as BuildRequestBodyParams['config'],
    effectiveAgentId: 'gruenerator-universal',
    typedSkillMention: null,
    safeCustomEnabledTools: null,
    extractedAttachments: [],
    notebookIds: [],
    forcedTools: [],
    documentIds: [],
    textIds: [],
    boardIds: [],
    sheetIds: [],
    docMentionIds: [],
    wolkeFiles: [],
    connectFiles: [],
    webpageUrls: [],
    regenerate: false,
    replaceFromMessageId: undefined,
    mergedDocChatIds: [],
    hasDocumentChat: false,
    injectedCurrentDocument: undefined,
    injectedCurrentBoard: undefined,
    injectedAttachmentContext: undefined,
    seededInitialAssistantMessage: undefined,
    currentSharepic: null,
    currentSocialPost: null,
    currentReel: null,
    reelUpload: null,
  });
}

describe('buildRequestBody — der Rollen-Dreiklang', () => {
  it('schickt im Modus eigener Prompt, Bezeichnung und Referenz', () => {
    const body = build({
      effectiveMode: 'eigener',
      customSystemPrompt: 'Du bist Sprecher*in des Klimabeirats.',
      customRoleName: ROLE.rolle,
      customRoleRef: ROLE,
    });
    expect(body.customSystemPrompt).toBe('Du bist Sprecher*in des Klimabeirats.');
    expect(body.roleName).toBe(ROLE.rolle);
    expect(body.roleRef).toEqual(ROLE);
    expect(body.agentId).toBeNull();
  });

  // Der Befund aus #2929: ein liegengebliebener Prompt einer frei getippten
  // Rolle lief hier weiter mit, obwohl der Chip längst weg war.
  it('schickt im Modus chat KEINEN Rollen-Prompt, auch wenn einer im Zustand liegt', () => {
    const body = build({
      effectiveMode: 'chat',
      customSystemPrompt: 'Du bist Sprecher*in des Klimabeirats.',
      customRoleName: ROLE.rolle,
      customRoleRef: ROLE,
    });
    expect(body.customSystemPrompt).toBeUndefined();
    expect(body.roleName).toBeUndefined();
    expect(body.roleRef).toBeUndefined();
    expect(body.agentId).toBe('gruenerator-universal');
  });

  it('lässt im Modus eigener ohne Rolle alle drei Felder weg', () => {
    const body = build({ effectiveMode: 'eigener' });
    expect(body.customSystemPrompt).toBeUndefined();
    expect(body.roleName).toBeUndefined();
    expect(body.roleRef).toBeUndefined();
  });

  it('trägt eine Katalogrolle als reine Referenz, ohne Prompttext', () => {
    // Der Auftrag einer Katalogrolle ist parteiintern und wird server-seitig
    // aufgelöst — der Client kennt ihn gar nicht.
    const body = build({
      effectiveMode: 'eigener',
      customRoleName: ROLE.rolle,
      customRoleRef: ROLE,
    });
    expect(body.customSystemPrompt).toBeUndefined();
    expect(body.roleRef).toEqual(ROLE);
  });
});
