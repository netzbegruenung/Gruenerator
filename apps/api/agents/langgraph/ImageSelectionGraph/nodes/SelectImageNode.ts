/**
 * SelectImageNode - AI-powered image selection from catalog
 */

import type { ImageSelectionState, CatalogImage, AISelectionResponse } from '../types.js';

/**
 * AI selects best image from catalog based on text and sharepic type
 */
export async function selectImageNode(
  state: ImageSelectionState
): Promise<Partial<ImageSelectionState>> {
  const { text, sharepicType, imageCatalog, aiWorkerPool, req } = state;

  try {
    if (!imageCatalog || !imageCatalog.images || imageCatalog.images.length === 0) {
      throw new Error('No images available in catalog');
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

    // Create image descriptions with index numbers
    const imageDescriptions = imageCatalog.images
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
      `[ImageSelection] AI selecting from ${imageCatalog.images.length} images for: "${text.substring(0, 50)}..."`
    );

    const result = await aiWorkerPool.processRequest(
      {
        type: 'image_picker',
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        options: {
          temperature: 0.6, // Increased for more variety
          max_tokens: 200,
          provider: 'mistral',
        },
      },
      req
    );

    // Debug logging to see exact AI response
    console.log(`[ImageSelection] Raw AI response:`, result.content);
    console.log(`[ImageSelection] Response type:`, typeof result.content);

    // Extract JSON from markdown code blocks if present
    let contentToParse = result.content;

    // Check for markdown code block wrapper
    if (contentToParse.includes('```')) {
      // Extract content between code block markers
      const jsonMatch = contentToParse.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch && jsonMatch[1]) {
        contentToParse = jsonMatch[1].trim();
        console.log(`[ImageSelection] Extracted JSON from markdown:`, contentToParse);
      }
    }

    // Parse AI response
    try {
      const selection: AISelectionResponse = JSON.parse(contentToParse);
      console.log(`[ImageSelection] Parsed successfully:`, selection);

      // Validate index
      const selectedIndex = selection.selectedIndex - 1; // Convert to 0-based
      if (selectedIndex < 0 || selectedIndex >= imageCatalog.images.length) {
        throw new Error(`Invalid image index: ${selection.selectedIndex}`);
      }

      const selectedImage = imageCatalog.images[selectedIndex];

      // Get alternatives (other relevant images)
      const alternatives = imageCatalog.images
        .filter((img, index) => index !== selectedIndex)
        .slice(0, 3);

      console.log(
        `[ImageSelection] Selected: ${selectedImage.filename} (confidence: ${selection.confidence})`
      );

      return {
        selectedImage,
        confidence: selection.confidence || 0.8,
        reasoning: 'AI selection based on description matching',
        alternatives,
        metadata: {
          ...state.metadata,
          selectionMethod: 'direct_ai_selection',
          aiConfidence: selection.confidence,
          totalImagesConsidered: imageCatalog.images.length,
        },
      };
    } catch (parseError) {
      console.warn('[ImageSelection] Failed to parse AI selection, using smart fallback');

      // Smart fallback: pick a thematically relevant image
      return performSmartFallback(text, imageCatalog.images, state);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[ImageSelection] Error in image selection:', errorMessage);

    // Final fallback to first image
    return performErrorFallback(imageCatalog?.images || [], state, errorMessage);
  }
}

/**
 * Smart fallback based on keyword matching
 */
function performSmartFallback(
  text: string,
  images: CatalogImage[],
  state: ImageSelectionState
): Partial<ImageSelectionState> {
  const textLower = text.toLowerCase();
  let fallbackImage: CatalogImage | undefined;

  // Try to find thematically relevant image based on keywords
  if (
    textLower.includes('klima') ||
    textLower.includes('energie') ||
    textLower.includes('umwelt')
  ) {
    fallbackImage = images.find((img) =>
      img.tags.some((tag) =>
        ['solar-energy', 'wind-energy', 'renewable-energy', 'environment'].includes(tag)
      )
    );
  } else if (
    textLower.includes('bahn') ||
    textLower.includes('transport') ||
    textLower.includes('öffentlich')
  ) {
    fallbackImage = images.find((img) =>
      img.tags.some((tag) => ['train', 'public-transport', 'transport'].includes(tag))
    );
  } else if (textLower.includes('europa') || textLower.includes('demokratie')) {
    fallbackImage = images.find((img) =>
      img.tags.some((tag) => ['european-union', 'eu', 'politics'].includes(tag))
    );
  } else if (
    textLower.includes('vielfalt') ||
    textLower.includes('respekt') ||
    textLower.includes('gleichberechtigung')
  ) {
    fallbackImage = images.find((img) =>
      img.tags.some((tag) => ['pride', 'equality', 'diversity'].includes(tag))
    );
  }

  // If no thematic match, use first image
  if (!fallbackImage) {
    fallbackImage = images[0];
  }

  const alternatives = images.filter((img) => img.filename !== fallbackImage!.filename).slice(0, 3);

  return {
    selectedImage: fallbackImage,
    confidence: 0.6,
    reasoning: 'Smart fallback selection based on content keywords',
    alternatives,
    metadata: {
      ...state.metadata,
      selectionMethod: 'smart_fallback',
    },
  };
}

/**
 * Error fallback - returns first available image
 */
function performErrorFallback(
  images: CatalogImage[],
  state: ImageSelectionState,
  errorMessage: string
): Partial<ImageSelectionState> {
  if (!images || images.length === 0) {
    return {
      error: 'No images available for fallback',
      metadata: {
        ...state.metadata,
        selectionMethod: 'error_fallback',
      },
    };
  }

  const fallbackImage = images[0];
  const alternatives = images.slice(1, 3);

  return {
    selectedImage: fallbackImage,
    confidence: 0.4,
    reasoning: 'Error fallback to first available image',
    alternatives,
    error: errorMessage,
    metadata: {
      ...state.metadata,
      selectionMethod: 'error_fallback',
    },
  };
}
