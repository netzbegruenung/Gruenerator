/**
 * Lesezugriff auf die öffentliche REST-API von Antragsgrün
 * (https://github.com/CatoTH/antragsgruen, `docs/openapi.yaml`, v0.4.0).
 *
 * Gelesen werden nur die vier Endpunkte, die ohne Anmeldung antworten:
 * Konsultationsliste, Übersicht einer Konsultation, Antrag, Änderungsantrag.
 * Die Antworten werden per Zod geprüft; nur die Felder, die das Notebook
 * braucht, stehen im Schema.
 *
 * Eigenheiten, am 15.11.2026 an gruene-nrw.antragsgruen.de gemessen:
 *   - Eine nicht öffentliche Konsultation (Landesrat) antwortet nicht mit 401,
 *     sondern leitet auf `/login?backUrl=…` um. `fetch` folgt der Umleitung und
 *     liefert die Login-Seite als HTML mit 200. Erkannt wird das an der
 *     End-URL bzw. am Content-Type → {@link NotPublicError}.
 *   - Die Antragsliste trägt keinen Antragstyp; Bewerbungen erkennt erst der
 *     Antrag selbst (`builders.ts`, `isCandidacy`).
 *   - `motionSlug` ist laut Spezifikation nicht stabil. Abgerufen wird nur über
 *     die `url_json` aus der Übersicht, gespeichert über die numerische `id`.
 */

import { z } from 'zod';

import { BRAND } from '../../../../utils/domainUtils.js';
import { HttpStatusError } from '../../base/BaseScraper.js';
import { type Fetcher, type PoliteGate } from '../../parliament/index.js';

import { type AntragsgruenInstance } from './instances.js';

const TIMEOUT_MS = 30_000;

const consultationRefSchema = z.object({
  title: z.string(),
  title_short: z.string(),
  date_published: z.string().nullable(),
  url_path: z.string(),
  url_json: z.string(),
  url_html: z.string(),
});
export type ConsultationRef = z.infer<typeof consultationRefSchema>;

const amendmentLinkSchema = z.object({
  id: z.number(),
  prefix: z.string().nullable(),
  status_id: z.number(),
  status_title: z.string(),
  url_json: z.string(),
  url_html: z.string(),
});
export type AmendmentLink = z.infer<typeof amendmentLinkSchema>;

const motionLinkSchema = z.object({
  type: z.literal('motion'),
  id: z.number(),
  agenda_item: z.string().nullable(),
  prefix: z.string().nullable(),
  title: z.string(),
  title_with_prefix: z.string(),
  status_id: z.number(),
  status_title: z.string(),
  initiators_html: z.string().nullable(),
  amendment_links: z.array(amendmentLinkSchema),
  url_json: z.string(),
  url_html: z.string(),
});
export type MotionLink = z.infer<typeof motionLinkSchema>;

const consultationSchema = z.object({
  title: z.string(),
  title_short: z.string(),
  motion_links: z.array(motionLinkSchema),
});
export type Consultation = z.infer<typeof consultationSchema>;

const sectionSchema = z.object({
  type: z.string(),
  title: z.string(),
  html: z.string().nullable(),
});
export type Section = z.infer<typeof sectionSchema>;

const initiatorSchema = z.object({
  type: z.string(),
  name: z.string().nullable(),
  organization: z.string().nullable(),
});
export type Initiator = z.infer<typeof initiatorSchema>;

const proposedProcedureSchema = z
  .object({
    status_id: z.number().nullable(),
    status_title: z.string().nullable(),
    sections: z.array(sectionSchema).nullish(),
  })
  .nullable();

export const motionSchema = z.object({
  id: z.number(),
  agenda_item: z.string().nullable(),
  prefix: z.string().nullable(),
  title: z.string(),
  title_with_prefix: z.string(),
  status_id: z.number(),
  status_title: z.string(),
  date_published: z.string().nullable(),
  initiators: z.array(initiatorSchema),
  initiators_html: z.string().nullable(),
  sections: z.array(sectionSchema),
  proposed_procedure: proposedProcedureSchema,
  url_html: z.string(),
});
export type Motion = z.infer<typeof motionSchema>;

export const amendmentSchema = z.object({
  id: z.number(),
  prefix: z.string().nullable(),
  title: z.string(),
  status_id: z.number(),
  status_title: z.string(),
  date_published: z.string().nullable(),
  motion: z.object({
    id: z.number(),
    agenda_item: z.string().nullable(),
    prefix: z.string().nullable(),
    title: z.string(),
  }),
  initiators: z.array(initiatorSchema),
  initiators_html: z.string().nullable(),
  sections: z.array(sectionSchema),
  proposed_procedure: proposedProcedureSchema,
  url_html: z.string(),
});
export type Amendment = z.infer<typeof amendmentSchema>;

/** Die Konsultation bzw. Seite verlangt eine Anmeldung oder hat die API aus. */
export class NotPublicError extends Error {
  constructor(url: string) {
    super(`not public: ${url}`);
    this.name = 'NotPublicError';
  }
}

export class AntragsgruenClient {
  constructor(
    private readonly instance: AntragsgruenInstance,
    private readonly gate: PoliteGate,
    private readonly fetcher: Fetcher
  ) {}

  listConsultations(): Promise<ConsultationRef[]> {
    return this.#get(`https://${this.instance.host}/rest`, z.array(consultationRefSchema));
  }

  consultation(ref: ConsultationRef): Promise<Consultation> {
    return this.#get(ref.url_json, consultationSchema);
  }

  motion(link: MotionLink): Promise<Motion> {
    return this.#get(link.url_json, motionSchema);
  }

  amendment(link: AmendmentLink): Promise<Amendment> {
    return this.#get(link.url_json, amendmentSchema);
  }

  async #get<T>(url: string, schema: z.ZodType<T>): Promise<T> {
    // Nur Adressen der eigenen Seite: `url_json` kommt aus der Antwort.
    if (new URL(url).host !== this.instance.host) throw new Error(`foreign host: ${url}`);
    const body = await this.gate.run(async () => {
      let res: Response;
      try {
        res = await this.fetcher(url, {
          timeout: TIMEOUT_MS,
          userAgent: BRAND.botUserAgent,
          headers: { Accept: 'application/json' },
        });
      } catch (error: unknown) {
        // „Public API disabled" (403) und eine abgelaufene Anmeldung (401).
        if (error instanceof HttpStatusError && (error.status === 401 || error.status === 403)) {
          throw new NotPublicError(url);
        }
        throw error;
      }
      const type = res.headers.get('content-type') ?? '';
      if (new URL(res.url || url).pathname === '/login' || !type.includes('json')) {
        throw new NotPublicError(url);
      }
      return (await res.json()) as unknown;
    });
    return schema.parse(body);
  }
}
