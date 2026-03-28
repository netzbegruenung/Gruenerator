import { generateText } from 'ai';

import { getModel } from '../../routes/chat/agents/providers.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('VisionService');

const VISION_PROVIDER = 'regolo' as const;
const VISION_MODEL_ID = 'mistral-small-2503';

export interface VisionAnalysisOptions {
  maxTokens?: number;
  temperature?: number;
}

export class VisionService {
  async analyzeImage(
    imageBase64: string,
    instruction: string,
    options?: VisionAnalysisOptions
  ): Promise<string> {
    const model = getModel(VISION_PROVIDER, VISION_MODEL_ID);

    const dataUrl = imageBase64.startsWith('data:')
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    log.info(`[Vision] Analyzing image (instruction: "${instruction.slice(0, 60)}...")`);
    const startTime = Date.now();

    const result = await generateText({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: instruction },
            { type: 'image', image: dataUrl },
          ],
        },
      ],
      maxOutputTokens: options?.maxTokens ?? 2000,
      temperature: options?.temperature ?? 0.3,
    });

    const elapsed = Date.now() - startTime;
    log.info(`[Vision] Analysis complete (${elapsed}ms, ${result.text.length} chars)`);

    return result.text;
  }

  async describeImage(imageBase64: string): Promise<string> {
    return this.analyzeImage(
      imageBase64,
      'Beschreibe dieses Bild detailliert. Was ist darauf zu sehen? Nenne Objekte, Personen, Text, Farben und den allgemeinen Kontext.'
    );
  }
}

export const visionService = new VisionService();
