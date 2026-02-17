/**
 * Self-Review Tool (Tier 2)
 *
 * Allows the agent to evaluate its own draft against agent-specific
 * quality criteria. Uses a smaller model (mistral-small) with
 * temperature 0.0 for deterministic, consistent scoring.
 *
 * Flow: Agent drafts → calls self_review → gets scored feedback → revises
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { createLogger } from '../../../../utils/logger.js';

import { formatCriteriaForPrompt, getReviewCriteria } from './reviewCriteria.js';

import type { ToolDependencies } from './registry.js';

const log = createLogger('Tool:SelfReview');

const REVIEW_SYSTEM_PROMPT = `Du bist ein strenger Qualitätsprüfer für politische Texte von Bündnis 90/Die Grünen.
Bewerte den folgenden Entwurf anhand der gegebenen Kriterien.

Antworte AUSSCHLIESSLICH im folgenden JSON-Format:
{
  "score": <1-5>,
  "checks": [
    { "criterion": "<Kriterium>", "passed": <true/false>, "note": "<kurze Begründung>" }
  ],
  "suggestions": ["<Verbesserungsvorschlag 1>", "<Verbesserungsvorschlag 2>"]
}

Bewertungsskala:
1 = Grundlegende Mängel, muss komplett überarbeitet werden
2 = Mehrere wichtige Kriterien nicht erfüllt
3 = Akzeptabel, aber deutliche Verbesserungsmöglichkeiten
4 = Gut, nur kleine Verbesserungen nötig
5 = Ausgezeichnet, alle Kriterien erfüllt`;

export function createSelfReviewTool(deps: ToolDependencies): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'self_review',
    description:
      'Bewerte einen Entwurf gegen die Qualitätskriterien. ' +
      'Nutze dieses Tool NACH dem Erstellen eines Entwurfs, um die Qualität zu prüfen und ggf. zu verbessern.',
    schema: z.object({
      draft: z.string().describe('Der zu prüfende Entwurf'),
      format_type: z
        .string()
        .optional()
        .describe('Art des Textes (z.B. Antrag, Rede, Pressemitteilung, Social-Media-Post)'),
    }),
    func: async ({ draft, format_type }) => {
      const criteria = getReviewCriteria(deps.agentConfig.identifier);
      if (!criteria) {
        return JSON.stringify({
          score: 4,
          checks: [],
          suggestions: ['Keine spezifischen Kriterien für diesen Agenten definiert.'],
        });
      }

      const criteriaText = formatCriteriaForPrompt(criteria);
      const userPrompt = [
        `Textart: ${format_type || deps.agentConfig.title}`,
        `\nKriterien:\n${criteriaText}`,
        `\nEntwurf:\n${draft.slice(0, 6000)}`,
      ].join('\n');

      try {
        const response = await deps.aiWorkerPool.processRequest(
          {
            type: 'self_review',
            provider: 'mistral',
            systemPrompt: REVIEW_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
            options: {
              model: 'mistral-small-latest',
              max_tokens: 800,
              temperature: 0.0,
              response_format: { type: 'json_object' },
            },
          },
          null,
        );

        const parsed = JSON.parse(response.content || '{}');
        log.info(`[SelfReview] Agent=${deps.agentConfig.identifier} score=${parsed.score}`);

        return JSON.stringify(parsed, null, 2);
      } catch (err: any) {
        log.warn(`[SelfReview] Review failed: ${err.message}`);
        return JSON.stringify({
          score: 3,
          checks: [],
          suggestions: ['Qualitätsprüfung konnte nicht durchgeführt werden. Bitte manuell überprüfen.'],
        });
      }
    },
  });
}
