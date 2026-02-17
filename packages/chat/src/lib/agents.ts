export interface AgentConfig {
  identifier: string;
  title: string;
  description: string;
  systemRole: string;
  avatar: string;
  backgroundColor: string;
  tags: string[];
  model: string;
  provider: 'mistral' | 'anthropic' | 'litellm';
  params: {
    max_tokens: number;
    temperature: number;
  };
  openingMessage: string;
  openingQuestions: string[];
  locale: string;
  author: string;
  plugins?: string[];
}

export function getDefaultAgent(): string {
  return 'gruenerator-universal';
}

export interface AgentListItem {
  identifier: string;
  title: string;
  description: string;
  avatar: string;
  backgroundColor: string;
  mention: string;
}

export const agentsList: AgentListItem[] = [
  {
    identifier: 'gruenerator-antrag',
    title: 'Antrag',
    description: 'Anträge & Anfragen',
    avatar: '📝',
    backgroundColor: '#316049',
    mention: 'antrag',
  },
  {
    identifier: 'gruenerator-buergerservice',
    title: 'Bürger*innenanfragen',
    description: 'Bürgeranfragen beantworten',
    avatar: '💬',
    backgroundColor: '#316049',
    mention: 'bürgerservice',
  },
  {
    identifier: 'gruenerator-gruene-jugend',
    title: 'Grüne Jugend',
    description: 'Aktivistischer Content',
    avatar: '✊',
    backgroundColor: '#46962b',
    mention: 'jugend',
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'Öffentlichkeitsarbeit',
    description: 'Presse & Social Media',
    avatar: '📢',
    backgroundColor: '#316049',
    mention: 'presse',
  },
  {
    identifier: 'gruenerator-rede-schreiber',
    title: 'Rede',
    description: 'Politische Reden',
    avatar: '🎙️',
    backgroundColor: '#316049',
    mention: 'rede',
  },
  {
    identifier: 'gruenerator-wahlprogramm',
    title: 'Wahlprogramm',
    description: 'Programmkapitel',
    avatar: '📋',
    backgroundColor: '#316049',
    mention: 'wahlprogramm',
  },
];

const mentionMap = new Map<string, string>(
  agentsList.map((a) => [a.mention.toLowerCase(), a.identifier])
);

export function resolveAgentMention(alias: string): string | null {
  return mentionMap.get(alias.toLowerCase()) ?? null;
}
