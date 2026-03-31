import { generateObject } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { getModel, isProviderConfigured } from '../ai/providers.js';

import type { LanguageModel } from 'ai';

const log = createLogger('SlideGeneration');

/**
 * Normalizes AI-generated slide content before storing to DB.
 * Fixes common LLM output quirks so layout components receive clean data.
 */
function normalizeAIContent(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(normalizeAIContent);

  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj);

  // {text: "value"} → "value"
  if (keys.length === 1 && 'text' in obj && typeof obj.text === 'string') {
    return obj.text;
  }

  // {type: "text", value: "..."} → "..."
  if ('type' in obj && obj.type === 'text' && 'value' in obj && typeof obj.value === 'string') {
    return obj.value;
  }

  // Objects with an array payload — unwrap to the array
  // {items: [...]} or {type: "list", items: [...]} or {list: [...]} or {points: [...]}
  for (const arrayKey of ['items', 'list', 'points']) {
    if (arrayKey in obj && Array.isArray(obj[arrayKey])) {
      return (obj[arrayKey] as unknown[]).map(normalizeAIContent);
    }
  }

  // {0: "a", 1: "b", ...} → ["a", "b", ...]
  if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
    return keys.sort((a, b) => Number(a) - Number(b)).map((k) => normalizeAIContent(obj[k]));
  }

  // Recurse into all values
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = normalizeAIContent(value);
  }
  return result;
}

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
    layout: 'neo-general:headline-text-with-stats-layout',
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
    layout: 'neo-general:thank-you-contact-info-footer-image-slide-layout',
  },
};

// --- Per-layout field specifications (shown to AI only for the current layout) ---

const LAYOUT_FIELD_SPECS: Record<string, string> = {
  intro: `- title: string (Präsentationstitel)
- description: string (kurze Beschreibung)
- presenterName: string (Name der vortragenden Person)
- presentationDate: string (Datum)
- image: string (unsplash.com URL)`,
  'basic-info': `- title: string (Folientitel)
- description: string (Haupttext)
- image: string (unsplash.com URL)`,
  'bullet-points': `- title: string (Folientitel)
- description: string (einleitender Text)
- bulletPoints: Array von Objekten [{title: string, description: string}] (3-5 Einträge)`,
  'bullet-with-icons': `- title: string (Folientitel)
- description: string (einleitender Text)
- image: string (unsplash.com URL)
- bulletPoints: Array von Objekten [{title: string, description: string, icon: string}] (3-5 Einträge)`,
  metrics: `- title: string (Folientitel)
- metrics: Array von Objekten [{label: string, value: string oder number, description: string}] (3-4 Einträge)`,
  quote: `- heading: string (Überschrift)
- quote: string (Zitat)
- author: string (Autor*in)
- backgroundImage: string (unsplash.com URL)`,
  table: `- title: string (Folientitel)
- tableData: Objekt mit:
  - headers: Array von strings ["Spalte1", "Spalte2", ...]
  - rows: Array von Arrays [["Wert1", "Wert2", ...], [...]]
- description: string (Beschreibung unter der Tabelle)`,
  'numbered-bullets': `- title: string (Folientitel)
- image: string (unsplash.com URL)
- bulletPoints: Array von Objekten [{title: string, description: string}] (3-6 Einträge)`,
  team: `- title: string (Folientitel)
- members: Array von Objekten [{name: string, role: string, image: string}] (3-5 Einträge, unsplash URLs für Bilder)`,
  chart: `- title: string (Folientitel)
- chartData: Objekt mit {type: "bar"|"line"|"pie", labels: string[], datasets: [{label: string, data: number[], backgroundColor: string[]}]}
- bulletPoints: Array von Objekten [{title: string, description: string}] (2-3 Einträge)`,
  'table-of-contents': `- intro: Objekt mit {title: string, description: string, presenterName: string, presentationDate: string, image: string}`,
  closing: `- title: string (Abschlusstitel)
- subtitle: string (Zusammenfassung)
- contactInfo: Objekt mit {email: string, phone: string, website: string}`,
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

  const userPrompt = `Erstelle eine Präsentation zum Thema: ${options.content}`;
  console.log('[slides-gen] generateOutline system prompt:', systemPrompt);
  console.log('[slides-gen] generateOutline user prompt:', userPrompt);

  const result = await generateObject({
    model,
    schema: SlideOutlineSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.7,
  });

  console.log('[slides-gen] generateOutline raw result:', JSON.stringify(result.object, null, 2));
  console.log('[slides-gen] generateOutline parsed outline:', {
    title: result.object.title,
    slideCount: result.object.slides.length,
    slides: result.object.slides.map((s, i) => ({
      index: i,
      title: s.title,
      suggestedLayout: s.suggestedLayout,
      contentPreview: s.content.slice(0, 80),
    })),
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
  const layoutFellBack = !LAYOUT_MAP[slideOutline.suggestedLayout];
  console.log(`[slides-gen] generateSlideContent layout mapping:`, {
    slideTitle: slideOutline.title,
    suggestedLayout: slideOutline.suggestedLayout,
    resolvedLayout: layoutInfo.layout,
    resolvedLayoutGroup: layoutInfo.layoutGroup,
    fellBackToBasicInfo: layoutFellBack,
  });

  const toneHint = TONE_DESCRIPTIONS[options.tone] || '';
  const verbosityHint = VERBOSITY_HINTS[options.verbosity] || '';

  const layoutFields =
    LAYOUT_FIELD_SPECS[slideOutline.suggestedLayout] || LAYOUT_FIELD_SPECS['basic-info']!;

  const systemPrompt = `Du bist ein Experte für Präsentationsfolien-Inhalte. Generiere strukturierte Inhalte für eine einzelne Folie.
${toneHint}
${verbosityHint}
Sprache: ${options.language}

WICHTIGE FORMAT-REGELN:
- Alle Textwerte MÜSSEN einfache Strings sein, KEINE Objekte. Richtig: "title": "Mein Titel". Falsch: "title": {"text": "Mein Titel"}.
- Arrays MÜSSEN direkte Arrays sein. Richtig: "bulletPoints": [{...}]. Falsch: "bulletPoints": {"items": [{...}]}.
- Für Bilder verwende unsplash.com URLs als einfache Strings.
- Verwende NUR die unten aufgeführten Felder für dieses Layout.

Layout-Typ: ${slideOutline.suggestedLayout}
Erwartete Felder:
${layoutFields}`;

  const slidePrompt = `Präsentation: "${presentationTitle}"
Folientitel: "${slideOutline.title}"
Folieninhalt-Beschreibung: ${slideOutline.content}`;
  console.log(`[slides-gen] generateSlideContent prompt for "${slideOutline.title}":`, slidePrompt);
  console.log(
    `[slides-gen] generateSlideContent system prompt for "${slideOutline.title}":`,
    systemPrompt
  );

  try {
    const result = await generateObject({
      model,
      schema: SlideContentSchema,
      system: systemPrompt,
      prompt: slidePrompt,
      temperature: 0.5,
    });

    console.log(
      `[slides-gen] generateSlideContent raw AI response for "${slideOutline.title}":`,
      JSON.stringify(result.object, null, 2)
    );
    console.log(
      `[slides-gen] generateSlideContent content keys for "${slideOutline.title}":`,
      Object.keys(result.object.content)
    );
    console.log(
      `[slides-gen] generateSlideContent speakerNote for "${slideOutline.title}":`,
      result.object.speakerNote ? result.object.speakerNote.slice(0, 100) : null
    );

    const normalizedContent = normalizeAIContent(result.object.content) as Record<string, unknown>;
    console.log(
      `[slides-gen] normalizedContent keys for "${slideOutline.title}":`,
      Object.keys(normalizedContent)
    );

    return {
      ...layoutInfo,
      content: normalizedContent,
      speakerNote: result.object.speakerNote,
    };
  } catch (err) {
    console.error(
      `[slides-gen] generateSlideContent FAILED for "${slideOutline.title}", using fallback:`,
      err
    );
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
  console.log('[slides-gen] generatePresentation called with options:', {
    content: options.content.slice(0, 200),
    nSlides: options.nSlides,
    language: options.language,
    tone: options.tone,
    verbosity: options.verbosity,
    instructions: options.instructions,
    includeTitleSlide: options.includeTitleSlide,
    includeTableOfContents: options.includeTableOfContents,
  });
  log.info('Generating presentation outline', { topic: options.content, nSlides: options.nSlides });

  const outline = await generateOutline(options);
  log.info('Outline generated', { title: outline.title, slideCount: outline.slides.length });

  const slides: SlideData[] = [];

  // Generate content for each slide (sequential to respect rate limits)
  for (let i = 0; i < outline.slides.length; i++) {
    const slideOutline = outline.slides[i]!;
    console.log(
      `[slides-gen] Generating slide ${i + 1}/${outline.slides.length}: "${slideOutline.title}" (layout: ${slideOutline.suggestedLayout})`
    );
    const slideData = await generateSlideContent(slideOutline, outline.title, options);
    console.log(`[slides-gen] Slide ${i + 1} result:`, {
      layout: slideData.layout,
      layoutGroup: slideData.layoutGroup,
      contentKeys: Object.keys(slideData.content),
      contentSample: JSON.stringify(slideData.content).slice(0, 300),
      hasSpeakerNote: !!slideData.speakerNote,
    });
    slides.push(slideData);
  }

  console.log(
    '[slides-gen] All slides generated summary:',
    slides.map((s, i) => ({
      index: i,
      layout: s.layout,
      contentKeys: Object.keys(s.content),
    }))
  );
  log.info('All slides generated', { count: slides.length });

  return {
    title: outline.title,
    slides,
  };
}
