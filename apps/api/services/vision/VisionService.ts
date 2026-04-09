import { generateText } from 'ai';

import { createLogger } from '../../utils/logger.js';
import { getModel, type ProviderName } from '../ai/providers.js';

import type { ExtractionResult } from '../OcrService/types.js';

const log = createLogger('VisionService');

const DEFAULT_VISION_PROVIDER: ProviderName = 'regolo';
const DEFAULT_VISION_MODEL = process.env.VISION_DEFAULT_MODEL || 'gemma4-31b';

export interface VisionOptions {
  provider?: ProviderName;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface TextDetectionResult {
  hasText: boolean;
  textType: 'screenshot' | 'document' | 'sign' | 'handwriting' | 'none';
  confidence: number;
  briefDescription: string;
}

export interface VisionAnalysisResult {
  description: string;
  textDetection: TextDetectionResult;
  extractedText: string | null;
  ocrMethod?: string;
}

const DBSV_ALT_TEXT_PROMPT = `Du erstellst Alternativtexte (Alt-Text) für Bilder basierend auf den Richtlinien des Deutschen Blinden- und Sehbehindertenverbands (DBSV). Alt-Text ist entscheidend, um Bilder für blinde und sehbehinderte Menschen zugänglich zu machen.

Befolge diese Richtlinien für effektiven Alt-Text:

1. Beginne mit den wichtigsten Informationen, die das Wesentliche des Bildes vermitteln (wie würdest du es jemandem am Telefon unter Zeitdruck beschreiben?)
2. Sei prägnant aber beschreibend, strebe 1-2 Sätze an
3. Verwende einfache, klare Sprache und vermeide Fachbegriffe oder Jargon
4. Beschreibe den Inhalt und die Funktion des Bildes, ohne zu interpretieren oder Meinungen zu äußern
5. Füge relevante Details hinzu, die für das Verständnis des Bildkontexts wesentlich sind
6. Vermeide Phrasen wie "Bild von" oder "Foto von", da Screenreader bereits anzeigen, dass es sich um ein Bild handelt
7. WICHTIG: Wenn Text im Bild sichtbar ist und für den Kontext relevant ist, gib den Text wörtlich wieder, ohne Anführungszeichen. Beispiel: "Plakat mit der Aufschrift Klimaschutz jetzt" statt "Plakat mit Text über Klimaschutz"

Struktur deinen Alt-Text in zwei Teilen:
- Pflicht: Kurz und knapp die nötigsten Infos im ersten Satz
- Kür: Genauere Beschreibung mit weniger wichtigen Details (falls nötig)

Gib deinen Alt-Text in <alt_text> Tags aus.`;

const TEXT_DETECTION_PROMPT = `Analyze this image and determine if it contains readable text. Respond ONLY with valid JSON, no other text:
{"hasText": boolean, "textType": "screenshot"|"document"|"sign"|"handwriting"|"none", "confidence": number between 0 and 1, "briefDescription": "one sentence describing the image"}`;

function resolveImageContent(
  imageSource: string
): { type: 'image'; image: URL } | { type: 'image'; image: string } {
  if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
    return { type: 'image', image: new URL(imageSource) };
  }
  if (imageSource.startsWith('data:')) {
    return { type: 'image', image: imageSource };
  }
  return { type: 'image', image: `data:image/jpeg;base64,${imageSource}` };
}

function resolveVisionModel(options?: VisionOptions) {
  const provider = options?.provider ?? DEFAULT_VISION_PROVIDER;
  const modelId = options?.model ?? DEFAULT_VISION_MODEL;
  return { model: getModel(provider, modelId), provider, modelId };
}

function stripBase64Prefix(imageSource: string): string {
  if (imageSource.startsWith('data:')) {
    return imageSource.replace(/^data:image\/[^;]+;base64,/, '');
  }
  return imageSource;
}

function guessMimeType(imageSource: string): string {
  if (imageSource.startsWith('data:')) {
    const match = imageSource.match(/^data:(image\/[^;]+);base64,/);
    if (match) return match[1];
  }
  return 'image/jpeg';
}

export class VisionService {
  async analyzeImage(
    imageSource: string,
    instruction: string,
    options?: VisionOptions
  ): Promise<string> {
    const { model, provider, modelId } = resolveVisionModel(options);
    const imageContent = resolveImageContent(imageSource);

    log.info(
      `[Vision] Analyzing image (${provider}/${modelId}, instruction: "${instruction.slice(0, 60)}...")`
    );
    const startTime = Date.now();

    const result = await generateText({
      model,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: instruction }, imageContent],
        },
      ],
      maxOutputTokens: options?.maxTokens ?? 2000,
      temperature: options?.temperature ?? 0.3,
    });

    log.info(
      `[Vision] Analysis complete (${Date.now() - startTime}ms, ${result.text.length} chars)`
    );
    return result.text;
  }

  async describeImage(imageSource: string, options?: VisionOptions): Promise<string> {
    return this.analyzeImage(
      imageSource,
      'Beschreibe dieses Bild detailliert. Was ist darauf zu sehen? Nenne Objekte, Personen, Text, Farben und den allgemeinen Kontext.',
      options
    );
  }

  async detectTextContent(
    imageSource: string,
    options?: VisionOptions
  ): Promise<TextDetectionResult> {
    const { model, provider, modelId } = resolveVisionModel(options);
    const imageContent = resolveImageContent(imageSource);

    log.info(`[Vision] Detecting text content (${provider}/${modelId})`);
    const startTime = Date.now();

    const result = await generateText({
      model,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: TEXT_DETECTION_PROMPT }, imageContent],
        },
      ],
      maxOutputTokens: 200,
      temperature: 0.1,
    });

    log.info(`[Vision] Text detection complete (${Date.now() - startTime}ms)`);

    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as TextDetectionResult;
        return {
          hasText: Boolean(parsed.hasText),
          textType: parsed.textType || 'none',
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
          briefDescription: parsed.briefDescription || '',
        };
      }
    } catch {
      log.warn('[Vision] Failed to parse text detection response, falling back to no-text');
    }

    return { hasText: false, textType: 'none', confidence: 0, briefDescription: '' };
  }

  async analyzeWithOcr(
    imageSource: string,
    instruction?: string,
    options?: VisionOptions
  ): Promise<VisionAnalysisResult> {
    const textDetection = await this.detectTextContent(imageSource, options);

    const defaultInstruction =
      instruction || 'Beschreibe dieses Bild detailliert. Was ist darauf zu sehen?';

    if (textDetection.hasText) {
      log.info(
        `[Vision] Text detected (type=${textDetection.textType}, confidence=${textDetection.confidence}), running vision + OCR in parallel`
      );

      const { ocrService } = await import('../OcrService/index.js');
      const base64Data = stripBase64Prefix(imageSource);
      const mimeType = guessMimeType(imageSource);

      const [description, ocrResult] = await Promise.all([
        this.analyzeImage(imageSource, defaultInstruction, options),
        ocrService
          .extractTextFromBase64(base64Data, 'image.jpg', mimeType)
          .catch((error: unknown) => {
            const msg = error instanceof Error ? error.message : String(error);
            log.warn(`[Vision] OCR failed, continuing with vision only: ${msg}`);
            return null;
          }) as Promise<ExtractionResult | null>,
      ]);

      return {
        description,
        textDetection,
        extractedText: ocrResult?.text || null,
        ...(ocrResult?.method && { ocrMethod: ocrResult.method }),
      };
    }

    const description = await this.analyzeImage(imageSource, defaultInstruction, options);

    return {
      description,
      textDetection,
      extractedText: null,
    };
  }

  async generateAltText(
    imageSource: string,
    context?: string,
    options?: VisionOptions
  ): Promise<string> {
    const { model, provider, modelId } = resolveVisionModel(options);
    const imageContent = resolveImageContent(imageSource);

    let userPrompt =
      'Analysiere dieses Bild und erstelle einen Alt-Text, der den DBSV-Richtlinien für Barrierefreiheit entspricht.';

    if (context) {
      userPrompt += `\n\nZusätzliche Bildbeschreibung vom Nutzer: ${context}`;
    }

    log.info(`[Vision] Generating alt text (${provider}/${modelId})`);
    const startTime = Date.now();

    const result = await generateText({
      model,
      messages: [
        { role: 'system', content: DBSV_ALT_TEXT_PROMPT },
        {
          role: 'user',
          content: [imageContent, { type: 'text', text: userPrompt }],
        },
      ],
      maxOutputTokens: options?.maxTokens ?? 2000,
      temperature: options?.temperature ?? 0.3,
    });

    log.info(`[Vision] Alt text generated (${Date.now() - startTime}ms)`);

    const match = result.text.match(/<alt_text>(.*?)<\/alt_text>/s);
    return match ? match[1].trim() : result.text;
  }
}

export const visionService = new VisionService();
