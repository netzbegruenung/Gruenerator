import { type Agent } from '@gruenerator/shared/agents';
import { generateSlugSuffix, slugifyName } from '@gruenerator/shared/utils';
import { useNavigate } from 'react-router-dom';

import { useCreateUserAgent, type UserAgentInput } from '../../agents/api';

/** `title` ist im Vertrag auf 100 Zeichen begrenzt — der Zusatz muss hineinpassen. */
const TITLE_MAX = 100;
const COPY_SUFFIX = ' (Kopie)';

function copyTitle(title: string): string {
  const room = TITLE_MAX - COPY_SUFFIX.length;
  return `${title.length > room ? title.slice(0, room).trimEnd() : title}${COPY_SUFFIX}`;
}

/**
 * Einen eigenen Grünerator duplizieren — ohne eigenen Endpunkt.
 *
 * Es gibt kein `POST /user-agents/:id/duplicate`, und es braucht auch keins:
 * die Liste liefert bereits den vollen Agenten, das Duplikat ist also ein
 * gewöhnliches Anlegen mit kopierten Feldern. Der Identifier wird wie im
 * Editor neu vergeben (Slug + Zufallssuffix) — er ist unveränderlich und darf
 * sich nicht mit dem Original überschneiden.
 *
 * Kopiert werden nur die Felder, die `createUserAgentBodySchema` kennt. Danach
 * geht es in den Editor: ein Duplikat, das man nicht sofort anpassen kann, ist
 * bloß ein zweiter Eintrag mit demselben Namen.
 */
export function useDuplicateAgent() {
  const navigate = useNavigate();
  const create = useCreateUserAgent();

  const duplicate = async (agent: Agent) => {
    const input: UserAgentInput = {
      identifier: `${slugifyName(agent.title, 'agent')}-${generateSlugSuffix().toLowerCase()}`,
      title: copyTitle(agent.title),
      description: agent.description,
      systemRole: agent.systemRole,
      avatar: agent.avatar,
      iconKey: agent.iconKey,
      backgroundColor: agent.backgroundColor,
      tags: [...agent.tags],
      model: agent.model,
      defaultModel: agent.defaultModel,
      provider: agent.provider,
      params: agent.params,
      openingMessage: agent.openingMessage,
      openingQuestions: [...agent.openingQuestions],
      locale: agent.locale,
      author: agent.author,
      defaultNotebookIds: agent.defaultNotebookIds ? [...agent.defaultNotebookIds] : undefined,
      plugins: agent.plugins ? [...agent.plugins] : undefined,
      enabledTools: agent.enabledTools ? [...agent.enabledTools] : undefined,
      fewShotExamples: agent.fewShotExamples ? [...agent.fewShotExamples] : undefined,
      inlineSourceLinks: agent.inlineSourceLinks,
      defaultRecipeMention: agent.defaultRecipeMention,
      defaultRecipeId: agent.defaultRecipeId,
    };
    const created = await create.mutateAsync(input);
    void navigate(`/agents/${created.identifier}/edit`);
  };

  return { duplicate, isPending: create.isPending };
}
