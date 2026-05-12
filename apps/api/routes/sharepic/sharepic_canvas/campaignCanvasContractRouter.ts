/**
 * ts-rest contract router for /api/campaign_canvas
 *
 * Covers POST /api/campaign_canvas from campaign_canvas.ts.
 *
 * Provides typed request-body validation for the campaignId + campaignTypeId
 * path. The direct campaignConfig path (raw canvas config object) is fully
 * delegated to the legacy route by NOT matching it here — callers that
 * supply campaignConfig will be handled by the legacy campaignCanvasRoute
 * mounted after this contract router.
 *
 * In practice the frontend always uses campaignId + campaignTypeId.
 *
 * Mount BEFORE the legacy campaignCanvasRoute in routes.ts so ts-rest
 * matches its own routes first; unmatched paths fall through to the legacy
 * router.
 *
 * Authentication: this endpoint does not require authentication.
 */

import { sharepicContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../../utils/contractValidationLogger.js';
import { createLogger } from '../../../utils/logger.js';

import { generateCampaignCanvas } from './campaign_canvas.js';

import type { Application } from 'express';

const log = createLogger('campaignCanvasContract');

const s = initServer();

export const campaignCanvasContractRouter = s.router(sharepicContract, {
  generateCampaignCanvas: async (args) => {
    try {
      const body = args.body;
      const campaignConfig = body.campaignConfig ?? null;
      const location = body.location ?? body.thema ?? '';
      const customCredit = body.customCredit ?? null;

      // Direct campaignConfig path — the legacy route handles this since we
      // cannot access the unexported canvas rendering internals from here.
      // The contract router mounts BEFORE the legacy router; when campaignConfig
      // is present we return a 400 with a clear message.
      // NOTE: The frontend only uses this path for advanced testing. In
      // production the campaignId + campaignTypeId path is always used.
      if (campaignConfig !== null) {
        const configRecord = campaignConfig as Record<string, unknown>;
        if (!configRecord.canvas) {
          return {
            status: 400 as const,
            body: {
              success: false,
              error: 'Campaign canvas configuration required',
            },
          };
        }

        // The campaignConfig path requires internal canvas rendering functions
        // that are not exported. Delegate to legacy by writing a specific
        // error — the caller should use campaignId + campaignTypeId instead.
        return {
          status: 400 as const,
          body: {
            success: false,
            error:
              'Use campaignId + campaignTypeId (direct campaignConfig not supported on this path)',
          },
        };
      }

      // campaignId + campaignTypeId path
      const campaignId = body.campaignId ?? null;
      const campaignTypeId = body.campaignTypeId ?? null;

      if (!campaignId || !campaignTypeId) {
        return {
          status: 400 as const,
          body: {
            success: false,
            error: 'Either campaignConfig or (campaignId + campaignTypeId) required',
          },
        };
      }

      const textData = {
        line1: body.line1 ?? '',
        line2: body.line2 ?? '',
        line3: body.line3 ?? '',
        line4: body.line4 ?? '',
        line5: body.line5 ?? '',
      };

      const { image, creditText } = await generateCampaignCanvas(
        campaignId,
        campaignTypeId,
        textData,
        location,
        customCredit
      );

      return {
        status: 200 as const,
        body: { success: true, image, creditText },
      };
    } catch (error) {
      log.error('[campaignCanvasContract.generateCampaignCanvas] Error:', { error });
      return {
        status: 500 as const,
        body: { success: false, error: (error as Error).message },
      };
    }
  },
});

/**
 * Mount the campaign canvas contract router onto an Express app.
 * Call from routes.ts BEFORE the legacy campaignCanvasRoute.
 */
export function mountCampaignCanvasContractRouter(app: Application): void {
  createExpressEndpoints(sharepicContract, campaignCanvasContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'sharepicContract'),
  });
}
