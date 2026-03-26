import { generateObject } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { getModel, isProviderConfigured } from '../ai/providers.js';

import type { LanguageModel } from 'ai';

const log = createLogger('SlideGeneration');

function getSlideModel(): LanguageModel {
  if (isProviderConfigured('litellm')) return getModel('litellm');
  if (isProviderConfigured('mistral')) return getModel('mistral');
  throw new Error('No AI provider configured for slide generation');
}

// --- Schemas ---

const SlideOutlineSchema = z.object({
  title: z.string(),
  slides: z.array(
    z.object({
      title: z.string(),
      content: z.string().describe('Brief outline of what this slide covers'),
      suggestedLayout: z.enum([
        'intro',
        'basic-info',
        'bullet-points',
        'bullet-with-icons',
        'metrics',
        'quote',
        'table',
        'chart',
        'team',
        'numbered-bullets',
        'table-of-contents',
        'closing',
      ]),
    })
  ),
});

const SlideContentSchema = z.object({
  content: z.record(z.unknown()).describe('Structured content matching the layout schema'),
  speakerNote: z.string().max(300).nullable(),
});

type SlideOutline = z.infer<typeof SlideOutlineSchema>;

// --- Layout Mapping ---

const LAYOUT_MAP: Record<string, { layoutGroup: string; layout: string }> = {
  intro: { layoutGroup: 'general', layout: 'general:general-intro-slide' },
  'basic-info': { layoutGroup: 'general', layout: 'general:basic-info-slide' },
  'bullet-points': {
    layoutGroup: 'neo-general',
    layout: 'neo-general:headline-text-with-bullets-and-stats',
  },
  'bullet-with-icons': { layoutGroup: 'general', layout: 'general:bullet-with-icons-slide' },
  metrics: { layoutGroup: 'general', layout: 'general:metrics-slide' },
  quote: { layoutGroup: 'general', layout: 'general:quote-slide' },
  table: { layoutGroup: 'general', layout: 'general:table-info-slide' },
  chart: { layoutGroup: 'general', layout: 'general:chart-with-bullets-slide' },
  team: { layoutGroup: 'general', layout: 'general:team-slide' },
  'numbered-bullets': { layoutGroup: 'general', layout: 'general:numbered-bullets-slide' },
  'table-of-contents': { layoutGroup: 'general', layout: 'general:table-of-contents-slide' },
  closing: {
    layoutGroup: 'neo-general',
    layout: 'neo-general:thank-you-contact-info-footer-image-slide',
  },
};

// --- Tone descriptions ---

const TONE_DESCRIPTIONS: Record<string, string> = {
  default: '',
  professional: 'Verwende einen professionellen, sachlichen Ton.',
  casual: 'Verwende einen lockeren, zugänglichen Ton.',
  educational: 'Verwende einen erklärenden, lehrreichen Ton.',
  sales_pitch: 'Verwende einen überzeugenden, marketing-orientierten Ton.',
  funny: 'Verwende einen humorvollen, unterhaltsamen Ton.',
};

const VERBOSITY_HINTS: Record<string, string> = {
  concise: 'Halte die Texte sehr kurz und prägnant. Maximal 1-2 Sätze pro Punkt.',
  standard: 'Verwende eine ausgewogene Textlänge. 2-3 Sätze pro Punkt.',
  'text-heavy': 'Schreibe ausführliche Texte mit Details und Erklärungen.',
};

// --- Pipeline ---

interface GenerateOptions {
  content: string;
  nSlides: number;
  language: string;
  tone: string;
  verbosity: string;
  instructions: string | null;
  includeTitleSlide: boolean;
  includeTableOfContents: boolean;
}

/**
 * Step 1: Generate presentation outline
 */
async function generateOutline(options: GenerateOptions): Promise<SlideOutline> {
  const model = getSlideModel();

  const toneHint = TONE_DESCRIPTIONS[options.tone] || '';
  const verbosityHint = VERBOSITY_HINTS[options.verbosity] || '';

  const systemPrompt = `Du bist ein Experte für Präsentationsdesign. Erstelle eine strukturierte Gliederung für eine Präsentation.
${toneHint}
${verbosityHint}
Sprache: ${options.language}
${options.instructions ? `Zusätzliche Anweisungen: ${options.instructions}` : ''}

Regeln:
- Erstelle genau ${options.nSlides} Folien
${options.includeTitleSlide ? '- Die erste Folie muss eine Intro/Titelfolie sein' : ''}
${options.includeTableOfContents ? '- Füge eine Inhaltsverzeichnis-Folie nach der Titelfolie ein' : ''}
- Jede Folie braucht einen klaren Titel und eine Beschreibung des Inhalts
- Wähle passende Layout-Typen für jeden Inhalt
- Die letzte Folie sollte ein Fazit oder Abschluss sein`;

  const result = await generateObject({
    model,
    schema: SlideOutlineSchema,
    system: systemPrompt,
    prompt: `Erstelle eine Präsentation zum Thema: ${options.content}`,
    temperature: 0.7,
  });

  return result.object;
}

interface SlideData {
  layoutGroup: string;
  layout: string;
  content: Record<string, unknown>;
  speakerNote: string | null;
}

/**
 * Step 2: Generate detailed content for each slide
 */
async function generateSlideContent(
  slideOutline: { title: string; content: string; suggestedLayout: string },
  presentationTitle: string,
  options: GenerateOptions
): Promise<SlideData> {
  const model = getSlideModel();
  const layoutInfo = LAYOUT_MAP[slideOutline.suggestedLayout] || LAYOUT_MAP['basic-info']!;

  const toneHint = TONE_DESCRIPTIONS[options.tone] || '';
  const verbosityHint = VERBOSITY_HINTS[options.verbosity] || '';

  const systemPrompt = `Du bist ein Experte für Präsentationsfolien-Inhalte. Generiere strukturierte Inhalte für eine einzelne Folie.
${toneHint}
${verbosityHint}
Sprache: ${options.language}

Der Inhalt muss als JSON-Objekt zurückgegeben werden, das zum Layout passt.
Verwende realistische Platzhalter-URLs für Bilder (unsplash.com URLs).
Für Icons verwende beschreibende Suchanfragen.

Layout-Typ: ${slideOutline.suggestedLayout}
Typische Felder je nach Layout:
- Intro: title, description, presenterName, presentationDate, image
- Basic Info: title, description, image
- Bullet Points: title, description, bulletPoints [{title, description}]
- Bullet with Icons: title, description, image, bulletPoints [{title, description, icon}]
- Metrics: title, metrics [{label, value, description}]
- Quote: heading, quote, author, backgroundImage
- Table: title, headers, rows
- Numbered Bullets: title, image, bulletPoints [{title, description}]
- Team: title, members [{name, role, image}]
- Chart: title, chartData, bulletPoints
- Closing: title, subtitle, contactInfo`;

  try {
    const result = await generateObject({
      model,
      schema: SlideContentSchema,
      system: systemPrompt,
      prompt: `Präsentation: "${presentationTitle}"
Folientitel: "${slideOutline.title}"
Folieninhalt-Beschreibung: ${slideOutline.content}`,
      temperature: 0.5,
    });

    return {
      ...layoutInfo,
      content: result.object.content as Record<string, unknown>,
      speakerNote: result.object.speakerNote,
    };
  } catch (err) {
    log.error('Failed to generate slide content, using fallback', err);
    return {
      ...layoutInfo,
      content: { title: slideOutline.title, description: slideOutline.content },
      speakerNote: null,
    };
  }
}

/**
 * Full pipeline: Generate a complete presentation
 */
export async function generatePresentation(options: GenerateOptions): Promise<{
  title: string;
  slides: SlideData[];
}> {
  log.info('Generating presentation outline', { topic: options.content, nSlides: options.nSlides });

  const outline = await generateOutline(options);
  log.info('Outline generated', { title: outline.title, slideCount: outline.slides.length });

  const slides: SlideData[] = [];

  // Generate content for each slide (sequential to respect rate limits)
  for (const slideOutline of outline.slides) {
    const slideData = await generateSlideContent(slideOutline, outline.title, options);
    slides.push(slideData);
  }

  log.info('All slides generated', { count: slides.length });

  return {
    title: outline.title,
    slides,
  };
}
