import { agentsList, type AgentListItem } from './agents';

export type MentionableType = 'agent' | 'notebook' | 'tool';

export interface Mentionable {
  type: MentionableType;
  identifier: string;
  title: string;
  description: string;
  avatar: string;
  backgroundColor: string;
  mention: string;
}

export interface CustomAgentMentionable {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export function agentToMentionable(agent: AgentListItem): Mentionable {
  return {
    type: 'agent',
    identifier: agent.identifier,
    title: agent.title,
    description: agent.description,
    avatar: agent.avatar,
    backgroundColor: agent.backgroundColor,
    mention: agent.mention,
  };
}

export function customAgentToMentionable(agent: CustomAgentMentionable): Mentionable {
  return {
    type: 'agent',
    identifier: agent.id,
    title: agent.name,
    description: agent.description || '',
    avatar: '🤖',
    backgroundColor: '#316049',
    mention: agent.slug,
  };
}

export const agentMentionables: Mentionable[] = agentsList.map(agentToMentionable);

let customAgentMentionables: Mentionable[] = [];

export function setCustomAgents(agents: CustomAgentMentionable[]): void {
  customAgentMentionables = agents.map(customAgentToMentionable);
  rebuildMentionableMap();
}

export function getCustomAgentMentionables(): Mentionable[] {
  return customAgentMentionables;
}

export const notebookMentionables: Mentionable[] = [
  {
    type: 'notebook',
    identifier: 'gruenerator-notebook',
    title: 'Alle Quellen',
    description: 'Durchsucht mehrere Quellen parallel',
    avatar: '🔍',
    backgroundColor: '#316049',
    mention: 'alle',
  },
  {
    type: 'notebook',
    identifier: 'gruene-notebook',
    title: 'Grundsatzprogramm',
    description: 'Grundsatzprogramme von Bündnis 90/Die Grünen',
    avatar: '📗',
    backgroundColor: '#316049',
    mention: 'grundsatz',
  },
  {
    type: 'notebook',
    identifier: 'bundestagsfraktion-notebook',
    title: 'Bundestagsfraktion',
    description: 'Inhalte von gruene-bundestag.de',
    avatar: '🏛️',
    backgroundColor: '#316049',
    mention: 'bundestag',
  },
  {
    type: 'notebook',
    identifier: 'hamburg-notebook',
    title: 'Grüne Hamburg',
    description: 'Beschlüsse und Presse der Grünen Hamburg',
    avatar: '⚓',
    backgroundColor: '#316049',
    mention: 'hamburg',
  },
  {
    type: 'notebook',
    identifier: 'schleswig-holstein-notebook',
    title: 'Grüne Schleswig-Holstein',
    description: 'Wahlprogramm Schleswig-Holstein',
    avatar: '🌊',
    backgroundColor: '#316049',
    mention: 'sh',
  },
  {
    type: 'notebook',
    identifier: 'thueringen-notebook',
    title: 'Grüne Thüringen',
    description: 'Beschlüsse und Wahlprogramme Thüringen',
    avatar: '🏔️',
    backgroundColor: '#316049',
    mention: 'thüringen',
  },
  {
    type: 'notebook',
    identifier: 'oesterreich-notebook',
    title: 'Grüne Österreich',
    description: 'Programme von Die Grünen Österreich',
    avatar: '🇦🇹',
    backgroundColor: '#88B04B',
    mention: 'at',
  },
  {
    type: 'notebook',
    identifier: 'bayern-notebook',
    title: 'Grüne Bayern',
    description: 'Regierungsprogramm Bayern',
    avatar: '🦁',
    backgroundColor: '#316049',
    mention: 'bayern',
  },
  {
    type: 'notebook',
    identifier: 'kommunalwiki-notebook',
    title: 'KommunalWiki',
    description: 'Fachwissen zur Kommunalpolitik',
    avatar: '📚',
    backgroundColor: '#316049',
    mention: 'kommunalwiki',
  },
  {
    type: 'notebook',
    identifier: 'boell-stiftung-notebook',
    title: 'Heinrich-Böll-Stiftung',
    description: 'Analysen und Dossiers der Böll-Stiftung',
    avatar: '📖',
    backgroundColor: '#316049',
    mention: 'böll',
  },
];

export const toolMentionables: Mentionable[] = [
  {
    type: 'tool',
    identifier: 'web',
    title: 'Websuche',
    description: 'Aktuelle Infos aus dem Web',
    avatar: '🌐',
    backgroundColor: '#2563EB',
    mention: 'websearch',
  },
  {
    type: 'tool',
    identifier: 'research',
    title: 'Recherche',
    description: 'Tiefgehende Multi-Quellen-Recherche',
    avatar: '🔬',
    backgroundColor: '#7C3AED',
    mention: 'recherche',
  },
  {
    type: 'tool',
    identifier: 'search',
    title: 'Dokumente',
    description: 'Parteiprogramme & Beschlüsse durchsuchen',
    avatar: '📄',
    backgroundColor: '#316049',
    mention: 'dokumente',
  },
  {
    type: 'tool',
    identifier: 'image',
    title: 'Bildgenerierung',
    description: 'Bild mit KI generieren (Flux)',
    avatar: '🎨',
    backgroundColor: '#D97706',
    mention: 'bildgenerieren',
  },
  {
    type: 'tool',
    identifier: 'image_edit',
    title: 'Stadt begrünen',
    description: 'Stadtbild mit Grün transformieren',
    avatar: '🌳',
    backgroundColor: '#059669',
    mention: 'stadtbegruenen',
  },
];

export function getAllMentionables(): Mentionable[] {
  return [...agentMentionables, ...customAgentMentionables, ...notebookMentionables, ...toolMentionables];
}

export const allMentionables: Mentionable[] = [...agentMentionables, ...notebookMentionables, ...toolMentionables];

const mentionableMap = new Map<string, Mentionable>();

function rebuildMentionableMap(): void {
  mentionableMap.clear();
  for (const m of agentMentionables) {
    mentionableMap.set(m.mention.toLowerCase(), m);
  }
  for (const m of customAgentMentionables) {
    if (!mentionableMap.has(m.mention.toLowerCase())) {
      mentionableMap.set(m.mention.toLowerCase(), m);
    }
  }
  for (const m of notebookMentionables) {
    if (!mentionableMap.has(m.mention.toLowerCase())) {
      mentionableMap.set(m.mention.toLowerCase(), m);
    }
  }
  for (const m of toolMentionables) {
    if (!mentionableMap.has(m.mention.toLowerCase())) {
      mentionableMap.set(m.mention.toLowerCase(), m);
    }
  }
}

// Initialize on load
rebuildMentionableMap();

export function resolveMentionable(alias: string): Mentionable | null {
  return mentionableMap.get(alias.toLowerCase()) ?? null;
}

export function filterMentionables(query: string): {
  agents: Mentionable[];
  customAgents: Mentionable[];
  notebooks: Mentionable[];
  tools: Mentionable[];
} {
  if (!query) {
    return {
      agents: agentMentionables,
      customAgents: customAgentMentionables,
      notebooks: notebookMentionables,
      tools: toolMentionables,
    };
  }
  const q = query.toLowerCase();
  const matchFn = (m: Mentionable) =>
    m.mention.toLowerCase().includes(q) ||
    m.title.toLowerCase().includes(q) ||
    m.identifier.toLowerCase().includes(q);

  return {
    agents: agentMentionables.filter(matchFn),
    customAgents: customAgentMentionables.filter(matchFn),
    notebooks: notebookMentionables.filter(matchFn),
    tools: toolMentionables.filter(matchFn),
  };
}
