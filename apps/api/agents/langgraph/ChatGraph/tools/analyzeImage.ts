import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { visionService } from '../../../../services/vision/index.js';
import { createLogger } from '../../../../utils/logger.js';

import type { ToolDependencies } from './registry.js';

const log = createLogger('Tool:AnalyzeImage');

export function createAnalyzeImageTool(deps: ToolDependencies): DynamicStructuredTool | null {
  if (!deps.imageAttachments || deps.imageAttachments.length === 0) {
    return null;
  }

  const imageCount = deps.imageAttachments.length;

  return new DynamicStructuredTool({
    name: 'analyze_image',
    description:
      `Analysiere ein angehängtes Bild mit einem Vision-Modell. ` +
      `Es ${imageCount === 1 ? 'ist 1 Bild' : `sind ${imageCount} Bilder`} angehängt. ` +
      `Nutze dieses Tool wenn der Nutzer Fragen zu einem hochgeladenen Bild hat ` +
      `oder du den Bildinhalt verstehen musst.`,
    schema: z.object({
      instruction: z
        .string()
        .describe(
          'Anweisung zur Bildanalyse (z.B. "Beschreibe das Bild", "Was steht auf dem Schild?")'
        ),
      imageIndex: z
        .number()
        .int()
        .min(0)
        .max(imageCount - 1)
        .default(0)
        .describe(
          `Index des zu analysierenden Bildes (0 bis ${imageCount - 1}). Standard: 0 (erstes Bild).`
        ),
    }),
    func: async ({ instruction, imageIndex = 0 }) => {
      const imageAttachment = deps.imageAttachments?.[imageIndex];
      if (!imageAttachment?.data) {
        return `Kein Bild an Index ${imageIndex} gefunden. Es sind ${imageCount} Bilder angehängt (Index 0-${imageCount - 1}).`;
      }

      log.info(
        `[AnalyzeImage] image=${imageIndex}/${imageCount} instruction="${instruction.slice(0, 60)}"`
      );

      try {
        const result = await visionService.analyzeImage(imageAttachment.data, instruction);
        return result;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
        log.error('[AnalyzeImage] Error:', message);
        return `Bildanalyse fehlgeschlagen: ${message}`;
      }
    },
  });
}
