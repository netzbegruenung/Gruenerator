/**
 * Rollen-Chat: was am Ende im Systemprompt beim Modell ankommt.
 *
 * Der Fehler, den diese Datei einzäunt, war an keiner Einzelstelle sichtbar.
 * Client, Contract, Auflösung und Prompt-Zusammenbau waren jeder für sich
 * richtig; nur die Rollenliste wurde aus dem Better-Auth-Sitzungsobjekt gelesen,
 * das die Spalte `user_defaults` gar nicht führt. `findRole` suchte in einer
 * leeren Liste, der Turn lief mit dem Basis-Agenten — und weil dessen
 * NUTZERKONTEXT-Block dem Modell verbietet, eine Rolle anzunehmen, antwortete
 * der Rollen-Chat wörtlich „Ich behandle dich neutral".
 *
 * Deshalb wird hier nicht die Auflösung geprüft, sondern der Prompt am Draht:
 * `respond.singlePassCalls[0].messages[0]` ist die Systemnachricht, die die
 * Antwort erzeugt hat.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../database/services/PostgresService.js', async () => {
  const { postgresMock } = await import('./harness/mocks.js');
  return postgresMock();
});
vi.mock('../services/threadPersistenceService.js', async () => {
  return await import('./harness/fakeThreadStore.js');
});
vi.mock('../services/threadAccessService.js', async () => {
  const { threadAccessMock } = await import('./harness/mocks.js');
  return threadAccessMock();
});
vi.mock('../services/compactionService.js', async (orig) => {
  const { compactionMock } = await import('./harness/mocks.js');
  return compactionMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/attachmentPersistenceService.js', async (orig) => {
  const { attachmentPersistenceMock } = await import('./harness/mocks.js');
  return attachmentPersistenceMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/pastChatRecallService.js', async (orig) => {
  const { pastChatRecallMock } = await import('./harness/mocks.js');
  return pastChatRecallMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/postResponseService.js', async (orig) => {
  const { postResponseMock } = await import('./harness/mocks.js');
  return postResponseMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/pipelineStateStore.js', async () => {
  const { pipelineStateStoreMock } = await import('./harness/mocks.js');
  return pipelineStateStoreMock();
});
vi.mock('../services/sharepicEditService.js', async (orig) => {
  const { sharepicEditMock } = await import('./harness/mocks.js');
  return sharepicEditMock((await orig()) as Record<string, unknown>);
});
// Wie in `intentExecutionLoop.vitest.ts`: der Deep-Agent-Pfad kommt in diesen
// Turns nicht vor, und sein Import-Graph zieht `deepagents` samt LangChain
// nach — in einem Worktree ohne vollen Install gar nicht vorhanden.
vi.mock('../services/deepAgentTurn.js', () => ({
  runDeepAgentTurn: () => Promise.resolve(null),
}));
// Die zwei Seams des Rollen-Pfades: Profiltabelle und privates Prompt-Verzeichnis.
vi.mock('../../../services/roles/userRoles.js', async () => {
  const { userRolesMock } = await import('./harness/mocks.js');
  return userRolesMock();
});
vi.mock('../../../services/skills/internalPrompts.js', async (orig) => {
  const { internalPromptsMock } = await import('./harness/mocks.js');
  return internalPromptsMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/agenticLoop/agenticRespondService.js', async (orig) => {
  const { fakeStreamAgenticResponse } = await import('./harness/respondScript.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    streamAgenticResponse: fakeStreamAgenticResponse,
  };
});
vi.mock('../services/responseStreamingService.js', async (orig) => {
  const { fakeResolveModel, fakeStreamForResolution, fakeStreamWithFallback } =
    await import('./harness/respondScript.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    resolveModel: fakeResolveModel,
    streamForResolution: fakeStreamForResolution,
    streamWithFallback: fakeStreamWithFallback,
  };
});

const { useChatApp } = await import('./harness/suite.js');
const { userTurn } = await import('./harness/testApp.js');
const { runTurn } = await import('./harness/trace.js');
const { respond } = await import('./harness/respondScript.js');
const { roleControl } = await import('./harness/mocks.js');

const suite = useChatApp();

/** Der Baustein aus dem privaten Repo, hier durch einen erkennbaren Satz ersetzt. */
const BAUSTEIN = 'Du arbeitest in einer Landesgeschäftsstelle von Bündnis 90/Die Grünen.';

const ROLE = {
  ebene: 'land',
  rolle: 'Mitarbeiter*in Landesgeschäftsstelle',
  bundesland: 'Bayern',
  gliederung: 'LV Bayern',
};

const ROLE_REF = { ebene: ROLE.ebene, rolle: ROLE.rolle };

/** „wer bin ich" — die Frage, an der der Fehler aufgefallen ist. */
const WHO_AM_I = 'wer bin ich';

/**
 * Die Systemnachricht, die den Turn erzeugt hat — egal über welchen der beiden
 * Antwortpfade er lief. Beide sind Doubles derselben Seams; welchen der
 * Klassifikator wählt, ist hier nicht der Prüfgegenstand.
 */
function systemText(): string {
  const agentic = respond.agenticCalls[0];
  if (agentic) return (agentic as { systemMessage: string }).systemMessage;
  const call = respond.singlePassCalls[0];
  if (!call) throw new Error('weder Loop- noch Single-Pass-Aufruf — der Turn antwortete nie');
  const messages = call.messages as Array<{ role: string; content: unknown }>;
  const system = messages.find((m) => m.role === 'system');
  if (!system) throw new Error('keine Systemnachricht in den Modell-Messages');
  return typeof system.content === 'string' ? system.content : JSON.stringify(system.content);
}

describe('Rollen-Chat: Systemprompt am Draht', () => {
  it('trägt den Baustein der referenzierten Rolle samt Kontextzeile ins Modell', async () => {
    roleControl.roles = [ROLE];
    roleControl.bausteine = { landesgeschaeftsstelle: BAUSTEIN };

    await runTurn(suite.baseUrl(), {
      messages: [userTurn(WHO_AM_I)],
      agentId: null,
      roleRef: ROLE_REF,
      roleName: ROLE.rolle,
    });

    const system = systemText();
    expect(system).toContain(BAUSTEIN);
    // Der Kontext steht NEBEN dem Baustein — die Rollendaten der Person, die im
    // privaten Prompttext nicht stehen können.
    expect(system).toContain('Dein Kontext: Land LV Bayern, Bayern.');
  });

  it('lässt den „unterstelle keine Rolle"-Block weg, sobald eine Rolle gilt', async () => {
    // Beides in EINER Systemnachricht wäre ein direkter Widerspruch: „Du
    // arbeitest in einer Landesgeschäftsstelle" und „hat keine Rolle angegeben".
    roleControl.roles = [ROLE];
    roleControl.bausteine = { landesgeschaeftsstelle: BAUSTEIN };

    await runTurn(suite.baseUrl(), {
      messages: [userTurn(WHO_AM_I)],
      agentId: null,
      roleRef: ROLE_REF,
    });

    expect(systemText()).not.toContain('hat keine Rolle oder Funktion angegeben');
  });

  it('behält den Negativ-Block ohne Rolle — sonst erfindet das Modell eine', async () => {
    await runTurn(suite.baseUrl(), { messages: [userTurn(WHO_AM_I)] });

    const system = systemText();
    expect(system).toContain('hat keine Rolle oder Funktion angegeben');
    expect(system).not.toContain(BAUSTEIN);
  });

  it('fällt auf den Basis-Agenten zurück, wenn die Referenz ins Leere zeigt', async () => {
    // Rolle inzwischen gelöscht, Thread trägt die Referenz weiter. Kein Fehler,
    // keine erfundene Ersatz-Persona.
    roleControl.bausteine = { landesgeschaeftsstelle: BAUSTEIN };

    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [userTurn(WHO_AM_I)],
      agentId: null,
      roleRef: ROLE_REF,
    });

    expect(trace.error).toBeNull();
    expect(systemText()).not.toContain(BAUSTEIN);
  });

  it('nimmt den KI-erzeugten Prompt einer frei getippten Rolle, die keinen Baustein hat', async () => {
    const FREE = 'Du bist die Assistenz für die Öffentlichkeitsarbeit im Ortsverband Musterhausen.';
    roleControl.roles = [{ ebene: 'ortsverband', rolle: 'Eigene Rolle', systemPrompt: FREE }];

    await runTurn(suite.baseUrl(), {
      messages: [userTurn(WHO_AM_I)],
      agentId: null,
      roleRef: { ebene: 'ortsverband', rolle: 'Eigene Rolle' },
    });

    expect(systemText()).toContain(FREE);
  });
});
