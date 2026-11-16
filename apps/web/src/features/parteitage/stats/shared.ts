import { type ConventionArea } from '@gruenerator/contracts';

export const AREA_LABEL: Record<ConventionArea, string> = {
  kreisfreie_stadt: 'kreisfreie Stadt',
  kreis: 'Kreis',
  ohne: 'ohne KV',
};

export const AREA_ORDER: ConventionArea[] = ['kreisfreie_stadt', 'kreis', 'ohne'];

/** Zwei vorhandene Theme-Tokens; die Bedeutung steckt zusätzlich in Legende und Beschriftung. */
export const AREA_COLOR: Record<ConventionArea, string> = {
  kreisfreie_stadt: 'var(--primary-500)',
  kreis: 'var(--grey-500)',
  ohne: 'var(--secondary-700)',
};

export const TEXT_CLASS = 'text-grey-700 dark:text-grey-300';

export function fmt(n: number, digits = 1): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: digits });
}
