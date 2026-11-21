/**
 * „Ich möchte, dass du ein Bild von mir bearbeitest" reached FLUX as the description of a new
 * image: the person got a picture of strangers (or a timeout) and paid for it. The setup call
 * now tells such a request apart, and the route asks for the photo before anything is booked.
 */
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../middleware/authMiddleware.js', () => ({
  requireAuth: (req: { user?: { id: string } }, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1' };
    next();
  },
}));
vi.mock('../../middleware/requireAiConsent.js', () => ({
  requireAiConsent: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../services/user/imageModelPreference.js', () => ({
  getImageModelForUser: vi.fn(async () => 'flux-pro'),
}));
const inferImageSetup = vi.fn();
vi.mock('../../services/flux/imageSetup.js', () => ({
  inferImageSetup: (...a: unknown[]) => inferImageSetup(...a),
}));
const reserve = vi.fn();
vi.mock('../../services/trees/index.js', () => ({
  getTreeBudget: () => ({ reserve, release: vi.fn() }),
  toTreeBudgetStatusDto: (s: unknown) => s,
  treeBudgetSpentMessage: () => 'spent',
  treeCostForImage: () => 1,
  TreeBudgetUnavailableError: class extends Error {},
}));
const create = vi.fn();
vi.mock('../../services/flux/FluxImageService.js', () => ({
  isFlux3Path: () => true,
  toFlux3AspectRatio: () => '4:5',
}));
vi.mock('../../services/flux/index.js', () => ({
  FluxImageService: { create: (...a: unknown[]) => create(...a) },
  VARIANTS: {},
  buildFluxPrompt: ({ subject }: { subject: string }) => ({
    prompt: subject,
    dimensions: { width: 896, height: 1120 },
  }),
}));

const { default: imaginePureRoute, EDIT_PHOTO_MISSING } = await import('./imaginePure.js');

let baseUrl = '';
let close: () => void = () => {};

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/imagine/pure', imaginePureRoute);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());

beforeEach(() => {
  inferImageSetup.mockReset();
  reserve.mockReset();
  create.mockReset();
});

const post = (prompt: string) =>
  fetch(`${baseUrl}/api/imagine/pure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

describe('POST /api/imagine/pure', () => {
  it('asks for the photo when the request is to edit one, before booking anything', async () => {
    inferImageSetup.mockResolvedValue({
      style: 'realistic-pure',
      format: '4:5',
      request: 'edit_photo',
    });

    const res = await post('ich möchte, dass du ein Bild von mir bearbeitest');

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      success: false,
      type: 'needs_image',
      error: EDIT_PHOTO_MISSING,
    });
    expect(reserve).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('goes on to the booking for the description of a new image', async () => {
    inferImageSetup.mockResolvedValue({
      style: 'realistic-pure',
      format: '4:5',
      request: 'new_image',
    });
    // Stop right after the booking: the path past the setup check is what matters here.
    reserve.mockResolvedValue({ ok: false, reason: 'unavailable' });

    const res = await post('Bild von einem Windrad bei Sonnenuntergang');

    expect(reserve).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(503);
  });
});
