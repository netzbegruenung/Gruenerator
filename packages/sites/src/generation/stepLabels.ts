import { type SiteGenerationStep } from '@gruenerator/contracts';

export const SITE_GENERATION_STEP_LABELS: Record<SiteGenerationStep, string> = {
  extract: 'Text wird aus dem Flyer gelesen',
  analyze: 'Flyer wird ausgewertet',
  write: 'Texte werden geschrieben',
  images: 'Bilder werden ausgesucht',
};
