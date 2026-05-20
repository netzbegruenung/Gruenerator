/**
 * User Agents routes — CRUD over per-user agent customisations.
 *
 * Mounted at /api/user-agents. System agents are static (registry); user
 * agents merge in via `agentLoader.getAgentForUser()`.
 */

import express, { type Response, type Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { type AuthenticatedRequest } from '../../middleware/types.js';
import { type TypedRequest, validateBody } from '../../middleware/validateBody.js';
import {
  createUserAgent,
  CUSTOM_GENERATOR_AGENT_PREFIX,
  customGeneratorToUserAgentInput,
  deleteUserAgent,
  getCustomGeneratorRow,
  getUserAgent,
  listUserAgents,
  updateUserAgent,
  type UserAgentInput,
  type UserAgentPatch,
} from '../../services/userAgents/userAgentsRepository.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('userAgents');

const identifierSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'Nur Kleinbuchstaben, Ziffern und Bindestriche erlaubt');

const paramsSchema = z
  .object({
    max_tokens: z.number().int().min(100).max(8000).default(3000),
    temperature: z.number().min(0).max(1).default(0.5),
  })
  .default({ max_tokens: 3000, temperature: 0.5 });

const fewShotExampleSchema = z.object({
  input: z.string(),
  output: z.string(),
  reasoning: z.string().optional(),
});

const userAgentInputSchema = z.object({
  identifier: identifierSchema,
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  systemRole: z.string().min(10),
  avatar: z.string().min(1).max(8),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  tags: z.array(z.string()).default([]),
  model: z.string().default('mistral-large-latest'),
  defaultModel: z.string().nullable().optional(),
  provider: z.enum(['mistral', 'anthropic', 'litellm', 'regolo']).default('mistral'),
  params: paramsSchema,
  openingMessage: z.string().default(''),
  openingQuestions: z.array(z.string()).default([]),
  locale: z.string().default('de-DE'),
  author: z.string().default('Eigene*r Agent*in'),
  plugins: z.array(z.string()).optional(),
  enabledTools: z.array(z.string()).optional(),
  fewShotExamples: z.array(fewShotExampleSchema).optional(),
});

const userAgentPatchSchema = userAgentInputSchema.partial().omit({ identifier: true });

type UserAgentBody = z.infer<typeof userAgentInputSchema>;
type UserAgentPatchBody = z.infer<typeof userAgentPatchSchema>;

/**
 * Strip keys whose value is `undefined`. Zod's `.optional()` returns
 * `field: T | undefined` (present-with-undefined), but the repository's
 * input types follow the project's strict-optional rule (`field?: T`,
 * no `| undefined`). This bridges the two without loosening either side.
 */
function compactUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key as keyof T] = value as T[keyof T];
  }
  return out;
}

const router: Router = express.Router();

router.use(requireAuth);

router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Nicht autorisiert.' });
      return;
    }
    const agents = await listUserAgents(userId);
    res.json({ success: true, agents });
  } catch (error) {
    const err = error as Error;
    log.error('[userAgents GET /] Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get(
  '/:identifier',
  async (req: AuthenticatedRequest<{ identifier: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Nicht autorisiert.' });
        return;
      }
      const agent = await getUserAgent(userId, req.params.identifier);
      if (!agent) {
        res.status(404).json({ success: false, message: 'Agent*in nicht gefunden.' });
        return;
      }
      res.json({ success: true, agent });
    } catch (error) {
      const err = error as Error;
      log.error('[userAgents GET /:identifier] Error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/**
 * Convert an existing custom_generators row into a real user_agents row.
 * The `prompt` becomes `system_role`; defaults fill the remaining required
 * fields. Identifier is `cg-<slug>` — same as the runtime virtualization, so
 * URLs (?agent=cg-foo) keep working before and after conversion.
 *
 * Returns 409 if the user already has a user_agent at that identifier (either
 * because they already converted this CG, or because they manually created
 * one with the same `cg-<slug>` identifier).
 */
router.post(
  '/convert-cg/:slug',
  async (req: AuthenticatedRequest<{ slug: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Nicht autorisiert.' });
        return;
      }

      const cgRow = await getCustomGeneratorRow(userId, req.params.slug);
      if (!cgRow) {
        res.status(404).json({ success: false, message: 'Custom Grünerator nicht gefunden.' });
        return;
      }

      const targetIdentifier = `${CUSTOM_GENERATOR_AGENT_PREFIX}${cgRow.slug}`;
      const existing = await getUserAgent(userId, targetIdentifier);
      if (existing) {
        res.status(409).json({
          success: false,
          message: 'Dieser Grünerator wurde bereits konvertiert.',
          agent: existing,
        });
        return;
      }

      const input = customGeneratorToUserAgentInput(cgRow);
      const agent = await createUserAgent(userId, input);
      res.status(201).json({ success: true, agent });
    } catch (error) {
      const err = error as Error;
      log.error('[userAgents POST /convert-cg/:slug] Error:', err);
      const status = err.message.includes('unique') ? 409 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  }
);

router.post(
  '/',
  validateBody(userAgentInputSchema),
  async (req: TypedRequest<UserAgentBody>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Nicht autorisiert.' });
        return;
      }
      if (req.body.identifier.startsWith('gruenerator-')) {
        res.status(400).json({
          success: false,
          message: 'Bezeichner darf nicht mit "gruenerator-" beginnen.',
        });
        return;
      }
      const input = compactUndefined(req.body) as UserAgentInput;
      const agent = await createUserAgent(userId, input);
      res.status(201).json({ success: true, agent });
    } catch (error) {
      const err = error as Error;
      log.error('[userAgents POST /] Error:', err);
      const status = err.message.includes('unique') ? 409 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  }
);

router.patch(
  '/:identifier',
  validateBody(userAgentPatchSchema),
  async (
    req: TypedRequest<UserAgentPatchBody, { identifier: string }>,
    res: Response
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Nicht autorisiert.' });
        return;
      }
      const patch = compactUndefined(req.body) as UserAgentPatch;
      const agent = await updateUserAgent(userId, req.params.identifier, patch);
      if (!agent) {
        res.status(404).json({ success: false, message: 'Agent*in nicht gefunden.' });
        return;
      }
      res.json({ success: true, agent });
    } catch (error) {
      const err = error as Error;
      log.error('[userAgents PATCH /:identifier] Error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.delete(
  '/:identifier',
  async (req: AuthenticatedRequest<{ identifier: string }>, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Nicht autorisiert.' });
        return;
      }
      const ok = await deleteUserAgent(userId, req.params.identifier);
      if (!ok) {
        res.status(404).json({ success: false, message: 'Agent*in nicht gefunden.' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      const err = error as Error;
      log.error('[userAgents DELETE /:identifier] Error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

export default router;
