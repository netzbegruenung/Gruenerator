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

export type SkillCategory = 'presse' | 'social' | 'dokumente' | 'recherche' | 'sonstiges';

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  presse: 'Presse & Kommunikation',
  social: 'Social Media',
  dokumente: 'Dokumente & Texte',
  recherche: 'Recherche & Analyse',
  sonstiges: 'Sonstiges',
};

export interface AgentListItem {
  identifier: string;
  title: string;
  description: string;
  avatar: string;
  backgroundColor: string;
  mention: string;
  contextPrefix?: string;
  skillCategory?: SkillCategory;
  promptTemplate?: string;
  isSystemDefault?: boolean;
}

export const agentsList: AgentListItem[] = [
  {
    identifier: 'gruenerator-antrag',
    title: 'Antrag',
    description: 'Anträge & Anfragen',
    avatar: '📝',
    backgroundColor: '#316049',
    mention: 'antrag',
    skillCategory: 'dokumente',
    isSystemDefault: true,
    promptTemplate: 'Schreibe einen Antrag zum Thema: ',
  },
  {
    identifier: 'gruenerator-buergerservice',
    title: 'Bürger*innenanfragen',
    description: 'Bürger*innenanfragen beantworten',
    avatar: '💬',
    backgroundColor: '#316049',
    mention: 'bürgerservice',
    skillCategory: 'presse',
    promptTemplate: 'Beantworte folgende Anfrage: ',
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'Pressemitteilung',
    description: 'Pressemitteilungen verfassen',
    avatar: '📰',
    backgroundColor: '#316049',
    mention: 'presse',
    contextPrefix: '[Plattform: Pressemitteilung]',
    skillCategory: 'presse',
    isSystemDefault: true,
    promptTemplate: 'Schreibe eine PM zum Thema: ',
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'Instagram',
    description: 'Instagram-Posts & Captions',
    avatar: '📸',
    backgroundColor: '#E1306C',
    mention: 'instagram',
    contextPrefix: '[Plattform: Instagram]',
    skillCategory: 'social',
    isSystemDefault: true,
    promptTemplate: 'Post zu folgendem Thema: ',
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'Facebook',
    description: 'Facebook-Posts & Beiträge',
    avatar: '👍',
    backgroundColor: '#1877F2',
    mention: 'facebook',
    contextPrefix: '[Plattform: Facebook]',
    skillCategory: 'social',
    promptTemplate: 'Beitrag zu folgendem Thema: ',
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'Twitter / X',
    description: 'Tweets & Threads',
    avatar: '🐦',
    backgroundColor: '#1DA1F2',
    mention: 'twitter',
    contextPrefix: '[Plattform: Twitter]',
    skillCategory: 'social',
    promptTemplate: 'Tweet zu folgendem Thema: ',
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'LinkedIn',
    description: 'LinkedIn-Posts & Artikel',
    avatar: '💼',
    backgroundColor: '#0A66C2',
    mention: 'linkedin',
    contextPrefix: '[Plattform: LinkedIn]',
    skillCategory: 'social',
    promptTemplate: 'LinkedIn-Post zu: ',
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'Reel / TikTok',
    description: 'Reel- & TikTok-Skripte',
    avatar: '🎬',
    backgroundColor: '#FE2C55',
    mention: 'reel',
    contextPrefix: '[Plattform: Reel/TikTok-Skript]',
    skillCategory: 'social',
    promptTemplate: 'Skript zu folgendem Thema: ',
  },
  {
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
    title: 'Aktionsideen',
    description: 'Kreative Aktionsideen entwickeln',
    avatar: '💡',
    backgroundColor: '#F59E0B',
    mention: 'aktion',
    contextPrefix: '[Plattform: Aktionsideen]',
    skillCategory: 'sonstiges',
    promptTemplate: 'Entwickle Aktionsideen zu: ',
  },
  {
    identifier: 'gruenerator-rede-schreiber',
    title: 'Rede',
    description: 'Politische Reden',
    avatar: '🎙️',
    backgroundColor: '#316049',
    mention: 'rede',
    skillCategory: 'presse',
    promptTemplate: 'Schreibe eine Rede zum Thema: ',
  },
  {
    identifier: 'gruenerator-wahlprogramm',
    title: 'Wahlprogramm',
    description: 'Programmkapitel',
    avatar: '📋',
    backgroundColor: '#316049',
    mention: 'wahlprogramm',
    skillCategory: 'dokumente',
  },
];

const mentionMap = new Map<string, string>(
  agentsList.map((a) => [a.mention.toLowerCase(), a.identifier])
);

export function resolveAgentMention(alias: string): string | null {
  return mentionMap.get(alias.toLowerCase()) ?? null;
}
