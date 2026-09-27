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
  activeSkillMention?: string | null;
  activeRecipeId?: string | null;
  typedSkillMention?: string | null;
  notebookAnswerMode?: 'auto' | 'chat' | 'praezision';
  formattedMessages?: BuildRequestBodyParams['formattedMessages'];
}): Record<string, unknown> {
  return buildRequestBody({
    effectiveMode: overrides.effectiveMode,
    formattedMessages: overrides.formattedMessages ?? [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Moin' }] },
    ],
    config: {
      ...(overrides.notebookAnswerMode && { notebookAnswerMode: overrides.notebookAnswerMode }),
      threadId: 'e4d1c0aa-0000-4000-8000-000000000001',
      customSystemPrompt: overrides.customSystemPrompt ?? null,
      customRoleName: overrides.customRoleName ?? null,
      customRoleRef: overrides.customRoleRef ?? null,
      activeSkillMention: overrides.activeSkillMention ?? null,
      activeRecipeId: overrides.activeRecipeId ?? null,
    } as unknown as BuildRequestBodyParams['config'],
    effectiveAgentId: 'gruenerator-universal',
    typedSkillMention: overrides.typedSkillMention ?? null,
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
    injectedCurrentCanvas: undefined,
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

describe('buildRequestBody — activeRecipeId', () => {
  it('carries the ambient recipe id alongside its skill mention', () => {
    const body = build({
      effectiveMode: 'chat',
      activeSkillMention: 'omveinladungen',
      activeRecipeId: 'recipe-omv-1',
    });
    expect(body.activeSkillMention).toBe('omveinladungen');
    expect(body.activeRecipeId).toBe('recipe-omv-1');
  });

  it('leaves it out for a system skill (no id set)', () => {
    const body = build({ effectiveMode: 'chat', activeSkillMention: 'presse' });
    expect(body.activeSkillMention).toBe('presse');
    expect(body.activeRecipeId).toBeUndefined();
  });

  it('drops the ambient recipe id when the message types its own mention', () => {
    const body = build({
      effectiveMode: 'chat',
      activeSkillMention: 'omveinladungen',
      activeRecipeId: 'recipe-omv-1',
      typedSkillMention: 'presse',
    });
    expect(body.activeSkillMention).toBe('presse');
    expect(body.activeRecipeId).toBeUndefined();
  });
});

describe('buildRequestBody — notebook answer mode', () => {
  it('sends the chosen answer mode on the notebook request', () => {
    for (const mode of ['auto', 'chat', 'praezision'] as const) {
      expect(build({ effectiveMode: 'notebook', notebookAnswerMode: mode }).answerMode).toBe(mode);
    }
  });

  it('omits the field when no mode is set, so the server keeps answering in chat mode', () => {
    expect(build({ effectiveMode: 'notebook' })).not.toHaveProperty('answerMode');
  });

  it('never sends it outside notebook mode', () => {
    expect(build({ effectiveMode: 'chat', notebookAnswerMode: 'praezision' })).not.toHaveProperty(
      'answerMode'
    );
  });

  it('sends the whole history, with each earlier answer carrying its mode', () => {
    const body = build({
      effectiveMode: 'notebook',
      notebookAnswerMode: 'auto',
      formattedMessages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Liste alle Quellen' }] },
        {
          id: 'a1',
          role: 'assistant',
          parts: [{ type: 'text', text: '1. …' }],
          answerMode: 'praezision',
        },
        { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'und die zweite?' }] },
      ],
    });
    expect(body.messages).toEqual([
      { role: 'user', content: 'Liste alle Quellen' },
      { role: 'assistant', content: '1. …', answerMode: 'praezision' },
      { role: 'user', content: 'und die zweite?' },
    ]);
  });
});
