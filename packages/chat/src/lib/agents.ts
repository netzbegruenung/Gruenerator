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
  contextPrefix?: string;
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
    description: 'Bürger*innenanfragen beantworten',
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
    title: 'Pressemitteilung',
    description: 'Pressemitteilungen verfassen',
    avatar: '📰',
    backgroundColor: '#316049',
    mention: 'presse',
    contextPrefix: '[Plattform: Pressemitteilung]',
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'Instagram',
    description: 'Instagram-Posts & Captions',
    avatar: '📸',
    backgroundColor: '#E1306C',
    mention: 'instagram',
    contextPrefix: '[Plattform: Instagram]',
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'Facebook',
    description: 'Facebook-Posts & Beiträge',
    avatar: '👍',
    backgroundColor: '#1877F2',
    mention: 'facebook',
    contextPrefix: '[Plattform: Facebook]',
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'Twitter / X',
    description: 'Tweets & Threads',
    avatar: '🐦',
    backgroundColor: '#1DA1F2',
    mention: 'twitter',
    contextPrefix: '[Plattform: Twitter]',
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'LinkedIn',
    description: 'LinkedIn-Posts & Artikel',
    avatar: '💼',
    backgroundColor: '#0A66C2',
    mention: 'linkedin',
    contextPrefix: '[Plattform: LinkedIn]',
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'Reel / TikTok',
    description: 'Reel- & TikTok-Skripte',
    avatar: '🎬',
    backgroundColor: '#FE2C55',
    mention: 'reel',
    contextPrefix: '[Plattform: Reel/TikTok-Skript]',
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'Aktionsideen',
    description: 'Kreative Aktionsideen entwickeln',
    avatar: '💡',
    backgroundColor: '#F59E0B',
    mention: 'aktion',
    contextPrefix: '[Plattform: Aktionsideen]',
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
