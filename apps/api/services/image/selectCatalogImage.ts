import { aiText } from '../ai/generate.js';

import type { ImageCatalogEntry } from './types.js';

export type CatalogSelectionMethod = 'direct_ai_selection' | 'smart_fallback';

export interface CatalogImageSelection {
  selectedImage: ImageCatalogEntry;
  confidence: number;
  reasoning: string;
  alternatives: ImageCatalogEntry[];
  selectionMethod: CatalogSelectionMethod;
}

interface AISelectionResponse {
  selectedIndex: number;
  confidence?: number;
}

/**
 * AI picks the best background image from the catalog. An unparseable or
 * out-of-range answer falls back to keyword matching; a failed AI call throws.
 */
export async function selectCatalogImage(
  text: string,
  sharepicType: string,
  images: ImageCatalogEntry[]
): Promise<CatalogImageSelection> {
  if (images.length === 0) {
    throw new Error('No images available for fallback');
  }

  const systemPrompt = `Du bist ein Experte für visuelle Kommunikation der Grünen Partei.

Wähle das beste Hintergrundbild für den gegebenen Sharepic-Text aus.

Kriterien für die Auswahl:
- Thematische Relevanz zum Text
- Politische Angemessenheit für Grüne Inhalte
- Visuelle Klarheit für Textüberlagerung
- Emotionale Wirkung und Botschaft
- Geeignet für ${sharepicType} Format

Antworte NUR mit einem JSON-Objekt (OHNE Markdown-Wrapper):
{
  "selectedIndex": 5,
  "confidence": 0.85
}

WICHTIG: Gib nur das JSON zurück, keine Code-Blöcke mit \`\`\`json\`\`\`!`;

  const imageDescriptions = images
    .map(
      (img, index) =>
        `${index + 1}. ${img.filename}
   Beschreibung: ${img.alt_text}
   Tags: ${img.tags.join(', ')}`
    )
    .join('\n\n');

  const userPrompt = `Text für Sharepic: "${text}"
Sharepic-Typ: ${sharepicType}

Verfügbare Hintergrundbilder:
${imageDescriptions}

Wähle den besten Hintergrund aus (gib die Nummer an).`;

  console.log(
    `[ImageSelection] AI selecting from ${images.length} images for: "${text.substring(0, 50)}..."`
  );

  const content = await aiText({
    lane: 'image_picker',
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.6,
    maxOutputTokens: 200,
  });

  console.log(`[ImageSelection] Raw AI response:`, content);

  let contentToParse = content;
  if (contentToParse.includes('```')) {
    const jsonMatch = contentToParse.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch && jsonMatch[1]) {
      contentToParse = jsonMatch[1].trim();
    }
  }

  try {
    const selection = JSON.parse(contentToParse) as AISelectionResponse;
    const selectedIndex = selection.selectedIndex - 1;
    const selectedImage = images[selectedIndex];
    if (selectedIndex < 0 || !selectedImage) {
      throw new Error(`Invalid image index: ${selection.selectedIndex}`);
    }

    console.log(
      `[ImageSelection] Selected: ${selectedImage.filename} (confidence: ${selection.confidence})`
    );

    return {
      selectedImage,
      confidence: selection.confidence || 0.8,
      reasoning: 'AI selection based on description matching',
      alternatives: images.filter((_img, index) => index !== selectedIndex).slice(0, 3),
      selectionMethod: 'direct_ai_selection',
    };
  } catch {
    console.warn('[ImageSelection] Failed to parse AI selection, using smart fallback');
    return smartFallback(text, images);
  }
}

const FALLBACK_THEMES: { keywords: string[]; tags: string[] }[] = [
  {
    keywords: ['klima', 'energie', 'umwelt'],
    tags: ['solar-energy', 'wind-energy', 'renewable-energy', 'environment'],
  },
  {
    keywords: ['bahn', 'transport', 'öffentlich'],
    tags: ['train', 'public-transport', 'transport'],
  },
  { keywords: ['europa', 'demokratie'], tags: ['european-union', 'eu', 'politics'] },
  {
    keywords: ['vielfalt', 'respekt', 'gleichberechtigung'],
    tags: ['pride', 'equality', 'diversity'],
  },
];

function smartFallback(text: string, images: ImageCatalogEntry[]): CatalogImageSelection {
  const textLower = text.toLowerCase();
  const theme = FALLBACK_THEMES.find((t) => t.keywords.some((k) => textLower.includes(k)));
  const fallbackImage =
    (theme && images.find((img) => img.tags.some((tag) => theme.tags.includes(tag)))) || images[0]!;

  return {
    selectedImage: fallbackImage,
    confidence: 0.6,
    reasoning: 'Smart fallback selection based on content keywords',
    alternatives: images.filter((img) => img.filename !== fallbackImage.filename).slice(0, 3),
    selectionMethod: 'smart_fallback',
  };
}
