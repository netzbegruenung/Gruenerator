/**
 * Topic names for the notebook overview. Data-only port of web's
 * `apps/web/src/features/monitor/topicConfig.ts` (mobile can't use the lucide
 * icons / Tailwind class strings) — the German labels must stay in sync with web.
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
