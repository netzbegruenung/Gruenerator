import { type ConventionArea } from '@gruenerator/contracts';

export const AREA_LABEL: Record<ConventionArea, string> = {
  kreisfreie_stadt: 'kreisfreie Stadt',
  kreis: 'Kreis',
  ohne: 'ohne KV',
};

export const AREA_ORDER: ConventionArea[] = ['kreisfreie_stadt', 'kreis', 'ohne'];

/** Definiert in parteitag-colors.css (hell/dunkel); die Bedeutung steht zusätzlich in der Legende. */
export const AREA_COLOR: Record<ConventionArea, string> = {
  kreisfreie_stadt: 'var(--pt-area-stadt)',
  kreis: 'var(--pt-area-kreis)',
  ohne: 'var(--pt-area-ohne)',
};

export const TEXT_CLASS = 'text-grey-700 dark:text-grey-300';

export function fmt(n: number, digits = 1): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: digits });
}
