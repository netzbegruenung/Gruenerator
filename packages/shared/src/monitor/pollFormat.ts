import { type PollData } from '@gruenerator/contracts';

export function isGruene(party: string): boolean {
  return party === 'GRÜNE' || party === 'Grüne' || party.toLowerCase().includes('grüne');
}

function grueneKey(average: Record<string, number>): string | null {
  for (const k of Object.keys(average)) if (isGruene(k)) return k;
  return null;
}

const de1 = (v: number): string =>
  v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const pct = (v: number | null | undefined): string => (v == null ? '–' : `${de1(v)}%`);

export function deltaText(d: number | null | undefined): string {
  if (d == null || d === 0) return '';
  return `${d > 0 ? '+' : ''}${de1(d)}`;
}

export function formatPollDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr.replace(/\s*\d{4}$/, '');
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
}

export interface GrueneSnapshot {
  value: number | null;
  delta: number | null;
  trend: { date: string; value: number }[];
  lastPoll: string | null;
}

/** The Grüne line of one parliament's poll answer, or null when there is none. */
export function grueneSnapshot(data: PollData | undefined): GrueneSnapshot | null {
  if (!data || Object.keys(data.average).length === 0) return null;
  const gk = grueneKey(data.average);
  return {
    value: gk ? data.average[gk] : null,
    delta: gk ? (data.diffs?.[gk] ?? null) : null,
    trend: gk ? (data.trend?.[gk] ?? []) : [],
    lastPoll: data.polls.length > 1 ? (data.polls[0]?.date ?? null) : null,
  };
}
