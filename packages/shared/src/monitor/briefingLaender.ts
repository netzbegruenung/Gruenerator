import { type MonitorLand, type MonitorLocale } from '@gruenerator/contracts';

/** A Bundesland with its own /briefing view (`?land=`). */
export interface BriefingLand {
  id: MonitorLand;
  name: string;
  /** Short label for the switch, where the full name is long. */
  short?: string;
  /** Completes „Heute bestimmt … die Nachrichten …". */
  place: string;
  locale: MonitorLocale;
}

/**
 * The Länder of the Land view. Ids come from `monitorLandSchema`; which
 * articles belong to a Land decides the API (`services/monitor/laender.ts`).
 * For now the view is reachable by address only (`/briefing?land=hessen`).
 */
export const BRIEFING_LAENDER = [
  { id: 'hessen', name: 'Hessen', place: 'in Hessen', locale: 'de' },
  {
    id: 'nordrhein-westfalen',
    name: 'Nordrhein-Westfalen',
    short: 'NRW',
    place: 'in NRW',
    locale: 'de',
  },
  { id: 'steiermark', name: 'Steiermark', place: 'in der Steiermark', locale: 'at' },
] as const satisfies readonly BriefingLand[];

/** The Land named by `?land=`, or null for an unknown or missing value. */
export function parseBriefingLand(value: string | null): BriefingLand | null {
  return BRIEFING_LAENDER.find((land) => land.id === value) ?? null;
}
