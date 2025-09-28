/**
 * Image Selection Graph using LangGraph
 * Single-step process:
 * 1. Load image catalog
 * 2. AI selects best image directly from all descriptions
 */

import { StateGraph, Annotation } from "@langchain/langgraph";
import fs from 'fs/promises';
import path from 'path';

// State schema for the image selection graph
const ImageSelectionState = Annotation.Root({
  // Input
  text: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  sharepicType: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  aiWorkerPool: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  req: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Core data
  imageCatalog: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Output
  selectedImage: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  confidence: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  reasoning: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  alternatives: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  metadata: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  error: Annotation({
    reducer: (x, y) => y ?? x,
  }),
});

// No predefined tags - AI will work with full image descriptions

// Load image catalog
async function loadImageCatalog(state) {
  try {
    const catalogPath = path.join(process.cwd(), 'public/sharepic_example_bg/image_alt_texts.json');
    const catalogData = await fs.readFile(catalogPath, 'utf8');
    const imageCatalog = JSON.parse(catalogData);

    console.log(`[ImageSelection] Loaded ${imageCatalog.images.length} images from catalog`);

    return {
      ...state,
      imageCatalog,
      metadata: {
        ...state.metadata,
        totalImages: imageCatalog.images.length,
        selectionMethod: 'direct_description_matching'
      }
    };
  } catch (error) {
    console.error('[ImageSelection] Failed to load image catalog:', error);
    return {
      ...state,
      error: 'Failed to load image catalog'
    };
  }
}

// Single-stage: AI selects best image from all descriptions

async function selectBestImage(state) {
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
    const imageDescriptions = imageCatalog.images.map((img, index) =>
      `${index + 1}. ${img.filename}
   Beschreibung: ${img.alt_text}
   Tags: ${img.tags.join(', ')}`
    ).join('\n\n');

    const userPrompt = `Text für Sharepic: "${text}"
Sharepic-Typ: ${sharepicType}

Verfügbare Hintergrundbilder:
${imageDescriptions}

Wähle den besten Hintergrund aus (gib die Nummer an).`;

    console.log(`[ImageSelection] AI selecting from ${imageCatalog.images.length} images for: "${text.substring(0, 50)}..."`);

    const result = await aiWorkerPool.processRequest({
      type: 'image_picker',
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      options: {
        temperature: 0.6, // Increased for more variety
        max_tokens: 200,
        provider: 'mistral'
      }
    }, req);

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
    let selection;
    try {
      selection = JSON.parse(contentToParse);
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

      console.log(`[ImageSelection] Selected: ${selectedImage.filename} (confidence: ${selection.confidence})`);

      return {
        ...state,
        selectedImage,
        confidence: selection.confidence || 0.8,
        reasoning: 'AI selection based on description matching',
        alternatives,
        metadata: {
          ...state.metadata,
          selectionMethod: 'direct_ai_selection',
          aiConfidence: selection.confidence,
          totalImagesConsidered: imageCatalog.images.length
        }
      };

    } catch (parseError) {
      console.warn('[ImageSelection] Failed to parse AI selection, using smart fallback');

      // Smart fallback: pick a thematically relevant image
      const textLower = text.toLowerCase();
      let fallbackImage;

      // Try to find thematically relevant image based on keywords
      if (textLower.includes('klima') || textLower.includes('energie') || textLower.includes('umwelt')) {
        fallbackImage = imageCatalog.images.find(img =>
          img.tags.some(tag => ['solar-energy', 'wind-energy', 'renewable-energy', 'environment'].includes(tag))
        );
      } else if (textLower.includes('bahn') || textLower.includes('transport') || textLower.includes('öffentlich')) {
        fallbackImage = imageCatalog.images.find(img =>
          img.tags.some(tag => ['train', 'public-transport', 'transport'].includes(tag))
        );
      } else if (textLower.includes('europa') || textLower.includes('demokratie')) {
        fallbackImage = imageCatalog.images.find(img =>
          img.tags.some(tag => ['european-union', 'eu', 'politics'].includes(tag))
        );
      } else if (textLower.includes('vielfalt') || textLower.includes('respekt') || textLower.includes('gleichberechtigung')) {
        fallbackImage = imageCatalog.images.find(img =>
          img.tags.some(tag => ['pride', 'equality', 'diversity'].includes(tag))
        );
      }

      // If no thematic match, use first image
      if (!fallbackImage) {
        fallbackImage = imageCatalog.images[0];
      }

      const alternatives = imageCatalog.images
        .filter(img => img.filename !== fallbackImage.filename)
        .slice(0, 3);

      return {
        ...state,
        selectedImage: fallbackImage,
        confidence: 0.6,
        reasoning: 'Smart fallback selection based on content keywords',
        alternatives,
        metadata: {
          ...state.metadata,
          selectionMethod: 'smart_fallback',
          parseError: parseError.message
        }
      };
    }

  } catch (error) {
    console.error('[ImageSelection] Error in image selection:', error);

    // Final fallback to first image
    const fallbackImage = imageCatalog.images[0];
    const alternatives = imageCatalog.images.slice(1, 3);

    return {
      ...state,
      selectedImage: fallbackImage,
      confidence: 0.4,
      reasoning: 'Error fallback to first available image',
      alternatives,
      error: error.message,
      metadata: {
        ...state.metadata,
        selectionMethod: 'error_fallback'
      }
    };
  }
}

// Create and configure the graph
function createImageSelectionGraph() {
  const workflow = new StateGraph(ImageSelectionState)
    .addNode("loadCatalog", loadImageCatalog)
    .addNode("selectImage", selectBestImage)
    .addEdge("loadCatalog", "selectImage")
    .setEntryPoint("loadCatalog")
    .setFinishPoint("selectImage");

  return workflow.compile();
}

export { createImageSelectionGraph, ImageSelectionState };