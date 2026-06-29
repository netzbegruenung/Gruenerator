import { DismissableBanner } from '@gruenerator/ui';

/** Shared dismiss key so the warning stays hidden across the studio landing and
 *  the canvas creation flow once dismissed. */
export const SHAREPIC_RESEARCH_PREVIEW_KEY = 'sharepic-research-preview-warning';

/**
 * Research-preview notice shown on every surface of the sharepic creation flow.
 * The canvas creator is public but still in active development, so this sets
 * expectations and points people at the team for bug reports.
 */
export function SharepicResearchPreviewBanner({ className }: { className?: string }) {
  return (
    <DismissableBanner
      storageKey={SHAREPIC_RESEARCH_PREVIEW_KEY}
      variant="warning"
      className={className}
    >
      <strong>Forschungsvorschau</strong> — Der Sharepic-Creator ist noch in der Erprobung.
      Funktionen können sich ändern und nicht alles funktioniert schon zuverlässig. Bitte melde
      Probleme dem Team.
    </DismissableBanner>
  );
}
