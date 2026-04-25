import type {
  KeywordEntry as NlpKeywordEntry,
  NlpClassificationResult as NlpClassificationResultBase,
  NounCount,
  EmotionScores,
} from '../nlp/types.js';

export type { NounCount, EmotionScores } from '../nlp/types.js';

export type TopicCategory =
  | 'migration'
  | 'klima'
  | 'wirtschaft'
  | 'soziales'
  | 'sicherheit'
  | 'gesundheit'
  | 'europa'
  | 'digital'
  | 'bildung'
  | 'finanzen'
  | 'justiz'
  | 'arbeit'
  | 'mobilitaet';

export const TOPIC_CATEGORIES: TopicCategory[] = [
  'migration',
  'klima',
  'wirtschaft',
  'soziales',
  'sicherheit',
  'gesundheit',
  'europa',
  'digital',
  'bildung',
  'finanzen',
  'justiz',
  'arbeit',
  'mobilitaet',
];

export type MonitorLocale = 'de' | 'at';

export interface TopicScore {
  topic: TopicCategory;
  score: number;
  articleCount: number;
  topArticles: MonitorArticle[];
}

export interface MonitorArticle {
  url: string;
  title: string;
  source: string;
  publishedAt: string | null;
  excerpt: string;
  locale: MonitorLocale;
  topics: Partial<Record<TopicCategory, number>>;
  primaryTopic: TopicCategory | null;
  topNouns?: NounCount[] | undefined;
  emotionScores?: EmotionScores | undefined;
  erSentiment?: number | undefined;
}

export type KeywordEntry = NlpKeywordEntry<TopicCategory | null>;

export interface SocialTrend {
  rank: number;
  name: string;
  url: string;
}

export interface MonitorSnapshot {
  id: string;
  createdAt: string;
  topics: TopicScore[];
  keywords: KeywordEntry[];
  socialTrends: SocialTrend[];
  totalArticles: number;
  sources: string[];
  articlesByLocale: { de: number; at: number };
}

export const EMOTION_NAMES: Record<string, string> = {
  angst: 'Angst',
  wut: 'Wut',
  hoffnung: 'Hoffnung',
  enttaeuschung: 'Enttäuschung',
  vertrauen: 'Vertrauen',
  solidaritaet: 'Solidarität',
  stolz: 'Stolz',
};

export const TOPIC_NAMES: Record<string, string> = {
  migration: 'Migration',
  klima: 'Klima & Umwelt',
  wirtschaft: 'Wirtschaft',
  soziales: 'Soziales',
  sicherheit: 'Sicherheit',
  gesundheit: 'Gesundheit',
  europa: 'Europa/Außen',
  digital: 'Digitales & Medien',
  bildung: 'Bildung',
  finanzen: 'Finanzen',
  justiz: 'Justiz/Recht',
  arbeit: 'Arbeit',
  mobilitaet: 'Mobilität',
};

// --- Meinungsbild (GERDA MRP estimates) ---

export interface MeinungsbildIssue {
  id: string;
  label_de: string;
  category: string;
  question_de: string;
  direction: string;
}

export interface MeinungsbildEstimate {
  state_code: string;
  state_name: string;
  estimate: number;
  pop: number;
}

export interface MeinungsbildData {
  issues: MeinungsbildIssue[];
  estimates: Record<string, MeinungsbildEstimate[]>;
  fetchedAt: string;
}

export type NlpClassificationResult = NlpClassificationResultBase<TopicCategory>;
