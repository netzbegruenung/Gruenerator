/**
 * Rate configuration for the Reisekosten engine — data-driven per
 * Landesverband / audience. NRW is shipped first; AT and other LVs are added
 * here as new entries (see CLAUDE.md: AT is a first-class audience).
 */
import { type RateKey } from '@gruenerator/contracts';

export interface RateConfig {
  key: RateKey;
  label: string;
  /** €/km for a car (Pkw). */
  kmSatzPkw: number;
  /** €/km for a motorcycle/scooter. */
  kmSatzMotorrad: number;
  /** Above this many km only the DB-Flexpreis is reimbursable. */
  kmObergrenze: number;
  /** One-day trip meal allowance. */
  verpflegungEintaegig: number;
  /** Arrival/departure day (time-independent) meal allowance. */
  verpflegungAnreiseAbreise: number;
  /** Full in-between day (24h absence) meal allowance. */
  verpflegungZwischentag: number;
  /** A one-day trip needs strictly more than this many hours of absence. */
  eintaegigMinStunden: number;
  /** Deduction for a provided breakfast. */
  abzugFruehstueck: number;
  /** Deduction for a provided lunch or dinner (each). */
  abzugHauptmahlzeit: number;
  /** Per-night flat rate for a private overnight without receipt. */
  uebernachtungPauschale: number;
  /** Submission deadline in months after the expense date. */
  fristMonate: number;
}

export const RATES: Record<RateKey, RateConfig> = {
  'de-DE/nrw': {
    key: 'de-DE/nrw',
    label: 'NRW (gültig ab 1.1.2020)',
    kmSatzPkw: 0.3,
    kmSatzMotorrad: 0.2,
    kmObergrenze: 400,
    verpflegungEintaegig: 14,
    verpflegungAnreiseAbreise: 14,
    verpflegungZwischentag: 28,
    eintaegigMinStunden: 8,
    abzugFruehstueck: 5.6,
    abzugHauptmahlzeit: 11.2,
    uebernachtungPauschale: 20,
    fristMonate: 3,
  },
};

export const DEFAULT_RATE_KEY: RateKey = 'de-DE/nrw';

export function getRate(key: RateKey): RateConfig {
  return RATES[key] ?? RATES[DEFAULT_RATE_KEY];
}
