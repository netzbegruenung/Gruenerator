/**
 * ts-rest router for /api/reisekosten — the Fahrtkosten-Grünerator.
 *   - extractBeleg: OCR + LLM extraction of an uploaded ticket/receipt
 *   - validate:     deterministic engine findings + belege cross-checks
 *   - pdf:          server-authoritative recompute → filled PDF
 */
import { reisekostenContract, type Finding } from '@gruenerator/contracts';
import { computeReisekosten, validateReisekosten } from '@gruenerator/shared/reisekosten';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import { extractBeleg } from './extractService.js';
import { buildReisekostenPdf } from './pdfBuilder.js';

import type { Application } from 'express';

const log = createLogger('reisekostenContract');
const s = initServer();

export const reisekostenContractRouter = s.router(reisekostenContract, {
  extractBeleg: async (args) => {
    try {
      const { base64, filename, mimeType, belegType } = args.body;
      const result = await extractBeleg(base64, filename, mimeType, belegType);
      return { status: 200 as const, body: result };
    } catch (error) {
      log.error('[reisekosten] extractBeleg failed:', error);
      return {
        status: 500 as const,
        body: { error: (error as Error).message || 'Beleg konnte nicht ausgewertet werden' },
      };
    }
  },

  validate: async (args) => {
    try {
      const { state, belege } = args.body;
      const findings: Finding[] = validateReisekosten(state);

      // AI-assisted cross-checks against already-extracted belege.
      for (const beleg of belege ?? []) {
        const entered =
          beleg.type === 'bahn'
            ? state.fahrt.bahn?.betrag
            : beleg.type === 'oepnv'
              ? state.fahrt.oepnv?.betrag
              : beleg.type === 'miete'
                ? state.fahrt.miete?.betrag
                : beleg.type === 'hotel'
                  ? (state.uebernachtung?.betrag ?? undefined)
                  : state.fahrt.sonstiges?.betrag;

        if (beleg.betrag != null && entered != null && Math.abs(beleg.betrag - entered) > 0.01) {
          findings.push({
            level: 'warn',
            field: `fahrt.${beleg.type}`,
            message: `Beleg (${beleg.betrag.toFixed(2)} €) weicht von der Eingabe (${entered.toFixed(2)} €) ab.`,
          });
        }
        if (beleg.type === 'hotel' && beleg.businessPackage === false) {
          findings.push({
            level: 'warn',
            field: 'uebernachtung',
            message:
              'Hotelfrühstück ist als "Frühstück" ausgewiesen und damit nicht erstattungsfähig – möglichst als "Business-Package"/"Servicepauschale" ausweisen lassen.',
          });
        }
      }

      return { status: 200 as const, body: { findings, compute: computeReisekosten(state) } };
    } catch (error) {
      log.error('[reisekosten] validate failed:', error);
      return {
        status: 500 as const,
        body: { error: (error as Error).message || 'Validierung fehlgeschlagen' },
      };
    }
  },

  pdf: async (args) => {
    try {
      const { state } = args.body;
      const buffer = await buildReisekostenPdf(state);
      const stamp = (state.reise.rueckkehr || '').slice(0, 10) || 'reise';
      return {
        status: 200 as const,
        body: {
          filename: `reisekosten-${stamp}.pdf`,
          pdfBase64: buffer.toString('base64'),
        },
      };
    } catch (error) {
      log.error('[reisekosten] pdf failed:', error);
      return {
        status: 500 as const,
        body: { error: (error as Error).message || 'PDF konnte nicht erstellt werden' },
      };
    }
  },
});

export function mountReisekostenContractRouter(app: Application): void {
  createExpressEndpoints(reisekostenContract, reisekostenContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'reisekostenContract'),
  });
}
