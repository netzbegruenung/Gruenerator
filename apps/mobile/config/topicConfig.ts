/**
 * Topic taxonomy for the notebook StatisticsSection. Data-only port of web's
 * `apps/web/src/features/monitor/topicConfig.ts` (mobile can't use the lucide
 * icons / Tailwind class strings) — the hex colours and German labels must stay
 * in sync with web so the topic-distribution chart matches across platforms.
 */

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

export const TOPIC_COLORS: Record<TopicCategory, string> = {
  migration: '#f59e0b',
  klima: '#22c55e',
  wirtschaft: '#3b82f6',
  soziales: '#ec4899',
  sicherheit: '#6366f1',
  gesundheit: '#14b8a6',
  europa: '#8b5cf6',
  digital: '#06b6d4',
  bildung: '#f97316',
  finanzen: '#eab308',
  justiz: '#78716c',
  arbeit: '#84cc16',
  mobilitaet: '#0ea5e9',
};

export const TOPIC_LABELS: Record<TopicCategory, string> = {
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

export const isTopicCategory = (topic: string): topic is TopicCategory => topic in TOPIC_LABELS;
