/**
 * Canva Autofill: a NEW design from one of the user's own designs with data
 * fields, or from a brand template of their team. The source is never changed
 * (`create_from_*` only, never `update_design`).
 *
 * Plan-bound: Canva grants the `autofill` and `brand_template` capabilities to
 * Pro, Teams and Enterprise. Free plans may get a few trial uses, which Canva
 * reports per job (a preview feature, passed through as is).
 *
 * Text fields only for now. Image, chart and sheet fields are listed but keep
 * the template's own content — Canva fills a field we leave out with its default.
 */
import {
  type CanvaAutofillFieldsResponse,
  type CanvaAutofillSuggestRequest,
  type CanvaAutofillSuggestResponse,
  type CanvaAutofillRequest,
  type CanvaAutofillResponse,
  type CanvaAutofillSource,
  type CanvaAutofillSourcesResponse,
} from '@gruenerator/contracts';

import { createLogger } from '../../../utils/logger.js';
import { aiObject } from '../../ai/generate.js';
import {
  createAutofillJob,
  getAutofillJob,
  getBrandTemplateDataset,
  getDesignDataset,
  getUserCapabilities,
  listBrandTemplates,
  type CanvaDataset,
} from '../../api-clients/canvaClient.js';

import { CanvaConnectionManager } from './CanvaConnectionManager.js';

const log = createLogger('canva-autofill');

const POLL_DELAYS_MS = [500, 1000, 1500, 2000, 3000, 5000, 5000, 5000, 5000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getAutofillSources(userId: string): Promise<CanvaAutofillSourcesResponse> {
  const accessToken = await CanvaConnectionManager.getValidAccessToken(userId);
  const capabilities = await getUserCapabilities(accessToken);
  const canUseBrandTemplates = capabilities.includes('brand_template');
  const brandTemplates = canUseBrandTemplates
    ? (await listBrandTemplates(accessToken)).items.map((t) => ({
        id: t.id,
        title: t.title,
        thumbnailUrl: t.thumbnail?.url ?? null,
      }))
    : [];
  return { canAutofill: capabilities.includes('autofill'), canUseBrandTemplates, brandTemplates };
}

async function datasetOf(accessToken: string, source: CanvaAutofillSource): Promise<CanvaDataset> {
  return source.kind === 'design'
    ? getDesignDataset(accessToken, source.id)
    : getBrandTemplateDataset(accessToken, source.id);
}

export async function getAutofillFields(
  userId: string,
  source: CanvaAutofillSource
): Promise<CanvaAutofillFieldsResponse> {
  const accessToken = await CanvaConnectionManager.getValidAccessToken(userId);
  const dataset = await datasetOf(accessToken, source);
  return {
    fields: Object.entries(dataset).map(([name, field]) => ({
      name,
      type: field.type,
      supported: field.type === 'text',
    })),
  };
}

export type AutofillOutcome =
  { ok: true; value: CanvaAutofillResponse } | { ok: false; status: 400 | 502; message: string };

export async function autofillDesign(
  userId: string,
  request: CanvaAutofillRequest
): Promise<AutofillOutcome> {
  const accessToken = await CanvaConnectionManager.getValidAccessToken(userId);

  // Only names the source really has, and only its text fields: Canva rejects
  // an unknown field, and sending text into an image field fails the job.
  const dataset = await datasetOf(accessToken, request.source);
  const data: Record<string, { type: 'text'; text: string }> = {};
  for (const [name, text] of Object.entries(request.texts)) {
    if (dataset[name]?.type === 'text' && text.trim() !== '') data[name] = { type: 'text', text };
  }
  if (Object.keys(data).length === 0) {
    return { ok: false, status: 400, message: 'Kein Textfeld dieser Vorlage ist ausgefüllt.' };
  }

  let job = await createAutofillJob(accessToken, {
    source:
      request.source.kind === 'design'
        ? { type: 'create_from_design', design_id: request.source.id }
        : { type: 'create_from_brand_template', brand_template_id: request.source.id },
    ...(request.title ? { title: request.title } : {}),
    data,
  });
  for (const delay of POLL_DELAYS_MS) {
    if (job.status !== 'in_progress') break;
    await sleep(delay);
    job = await getAutofillJob(accessToken, job.id);
  }

  const design = job.result?.design;
  const editUrl = design?.urls?.edit_url ?? design?.url;
  if (job.status !== 'success' || !design || !editUrl) {
    log.warn('Canva autofill did not finish', {
      userId,
      jobId: job.id,
      status: job.status,
      code: job.error?.code,
    });
    return {
      ok: false,
      status: 502,
      message:
        job.status === 'in_progress'
          ? 'Canva braucht länger als erwartet. Das Design erscheint gleich in deinem Canva-Konto.'
          : 'Canva konnte das Design nicht erstellen.',
    };
  }

  const trial = job.result?.trial_information;
  return {
    ok: true,
    value: {
      design: {
        title: design.title ?? null,
        editUrl,
        thumbnailUrl: design.thumbnail?.url ?? null,
      },
      trial: trial ? { usesRemaining: trial.uses_remaining, upgradeUrl: trial.upgrade_url } : null,
    },
  };
}

/**
 * The text fields of a source, filled from what someone wrote in the Studio
 * („Plakat für den Infostand am 3.11. auf dem Marktplatz"). A proposal only —
 * the page shows it for review before anything reaches Canva.
 *
 * Field names are the template author's own labels (TITEL, DATUM, ORT …), so
 * they are the only hint what belongs where. A field the request says nothing
 * about stays empty rather than invented: a made-up date on a poster is worse
 * than a gap the user sees.
 */
export async function suggestAutofillTexts(
  userId: string,
  request: CanvaAutofillSuggestRequest,
  locale: string | null
): Promise<CanvaAutofillSuggestResponse> {
  const { fields } = await getAutofillFields(userId, request.source);
  const names = fields.filter((f) => f.supported).map((f) => f.name);
  if (names.length === 0) return { texts: {} };

  const country =
    locale === 'de-AT'
      ? 'Die Person ist bei den Grünen in Österreich aktiv; schreibe österreichisches Deutsch.'
      : 'Die Person ist bei Bündnis 90/Die Grünen in Deutschland aktiv.';
  const result = await aiObject<Record<string, string>>({
    lane: 'canva_autofill',
    system: [
      'Du füllst die Textfelder einer Canva-Vorlage (Plakat, Social-Media-Post, Flyer) für grüne Politik.',
      country,
      'Jedes Feld hat einen Namen, den die Vorlage selbst trägt; leite daraus ab, was hineingehört (z. B. TITEL = kurze Überschrift, DATUM = Datum, ORT = Ort).',
      'Schreibe knapp, wie auf einem Plakat: Überschriften höchstens acht Wörter, Fließtextfelder höchstens zwei kurze Sätze.',
      'Übernimm Daten, Uhrzeiten, Orte, Namen und Zahlen nur, wenn sie in der Anfrage stehen. Steht nichts dazu da, lass das Feld leer ("").',
    ].join(' '),
    prompt: `Felder: ${names.join(', ')}\n\nAnfrage:\n${request.prompt}`,
    schema: {
      type: 'object',
      properties: Object.fromEntries(names.map((n) => [n, { type: 'string' }])),
      required: names,
    },
    toolName: 'felder_fuellen',
    toolDescription: 'Die Textfelder der Canva-Vorlage befüllen.',
    validate: (input) => {
      if (typeof input !== 'object' || input === null) {
        return { ok: false, error: 'Erwartet ein Objekt mit den Feldnamen.' };
      }
      const raw = input as Record<string, unknown>;
      const texts: Record<string, string> = {};
      for (const name of names) {
        const value = raw[name];
        texts[name] = typeof value === 'string' ? value.trim() : '';
      }
      return { ok: true, value: texts };
    },
  });
  if (!result.ok) {
    log.warn('Canva autofill suggestion failed', { userId, error: result.error });
    throw Object.assign(new Error('Der Vorschlag konnte nicht erstellt werden'), {
      statusCode: 502,
    });
  }
  return { texts: result.data };
}
