/**
 * Zod-Schemata für die Sichtbarkeit von Grünerator-Agenten — der öffentliche
 * Lesezugriff, den jede Entdeckungsfläche braucht, und die admin-gesicherte
 * Liste samt Schalter. Spiegelt apps/api/routes/agents/agentVisibilityContractRouter.ts.
 *
 * Schlüssel ist der `identifier` (z. B. 'gruenerator-antrag'). Bei Rezepten
 * (`adminSkills.ts`) wäre das der falsche Schlüssel, weil dort der Identifier
 * den besitzenden Agenten benennt — hier ist er der Agent selbst.
 */
import { z } from 'zod';

// ── Antworten ────────────────────────────────────────────────────────────────

export const agentVisibilityResponseSchema = z.object({
  hiddenIdentifiers: z.array(z.string()),
});

export const adminAgentEntrySchema = z.object({
  identifier: z.string(),
  title: z.string(),
  slug: z.string().nullable(),
  hidden: z.boolean(),
});

export const adminAgentListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(adminAgentEntrySchema),
});

export const adminAgentSuccessResponseSchema = z.object({
  success: z.boolean(),
});

export const adminAgentErrorResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// ── Anfragekörper ────────────────────────────────────────────────────────────

export const setAgentHiddenBodySchema = z.object({
  hidden: z.boolean(),
});
