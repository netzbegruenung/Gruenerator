/**
 * Antragsgrün-Antrag bzw. -Änderungsantrag → Dokument des Notebooks „Parteitage".
 *
 * Eine Einheit ist ein Antrag oder ein Änderungsantrag (ÄA). Der Text ist
 * strukturerhaltend (siehe CLAUDE.md, „full_text und chunk_text"): ein kurzer
 * Kopf, dann je Abschnitt eine `##`-Überschrift. Der Kopf bleibt kurz, weil die
 * NLP-Anreicherung nur die ersten 1500 Zeichen liest (`notebookEnrichmentService`).
 */

import * as cheerio from 'cheerio';

import { generateContentHash } from '../../../../utils/validation/index.js';
import { htmlToStructuredText } from '../../utils/htmlCleaner.js';

import {
  type Amendment,
  type AmendmentLink,
  type ConsultationRef,
  type Initiator,
  type Motion,
  type MotionLink,
  type Section,
} from './antragsgruenClient.js';
import { type AntragsgruenInstance } from './instances.js';

export const PARTEITAGE_SOURCE = 'parteitage';
export const PARTEITAGE_COLLECTION = 'parteitage_documents';

export const PARTEITAGE_CONTENT_TYPES = ['antrag', 'beschluss', 'aenderungsantrag'] as const;
export type ParteitageContentType = (typeof PARTEITAGE_CONTENT_TYPES)[number];

export const PARTEITAGE_CONTENT_TYPE_LABELS: Record<ParteitageContentType, string> = {
  antrag: 'Antrag',
  beschluss: 'Beschluss',
  aenderungsantrag: 'Änderungsantrag',
};

/** `IMotion::STATUS_RESOLUTION_PRELIMINARY` / `…_FINAL` in Antragsgrün. */
const RESOLUTION_STATUS_IDS = new Set([25, 26]);

/** Abschnitte ohne lesbaren Text (Foto, PDF, Video, Auswahlfeld) und der Titel, der im Kopf steht. */
const SKIPPED_SECTION_TYPES = new Set([
  'Title',
  'Image',
  'PDFAttachment',
  'PDFAlternative',
  'VideoEmbed',
  'Choice',
]);

/** Ein HTML-Fragment (Statustitel, Antragstellerzeile) als einzeiliger Text. */
export function plainText(html: string | null | undefined): string {
  if (!html) return '';
  return cheerio.load(html).root().text().replace(/\s+/g, ' ').trim();
}

/**
 * Bewerbungen (Listen- und Vorstandswahlen) bleiben draußen: Selbstvorstellungen
 * mit Foto, Geburtsjahr und Social-Media-Profilen sind personenbezogene Daten
 * über den Parteitag hinaus. Die Liste trägt keinen Antragstyp, der Antrag
 * selbst auch nicht; erkennbar ist eine Bewerbung an ihrem Foto-Abschnitt.
 */
export function isCandidacy(motion: Pick<Motion, 'sections'>): boolean {
  return motion.sections.some((s) => s.type === 'Image');
}

export function contentTypeOfMotion(motion: Pick<Motion, 'status_id'>): ParteitageContentType {
  return RESOLUTION_STATUS_IDS.has(motion.status_id) ? 'beschluss' : 'antrag';
}

/**
 * Antragsgrün markiert Einfügungen und Streichungen nur farbig (`<ins>`,
 * `<del>`, `.inserted`, `.deleted`). Ohne Übertragung in Text verschwände der
 * Unterschied in `htmlToStructuredText`, und ein ÄA läse sich wie Antragstext.
 */
export function markDiff(html: string): string {
  const $ = cheerio.load(html, null, false);
  const wrap = (selector: string, label: string) => {
    $(selector).each((_, el) => {
      $(el).prepend(`[${label}: `).append(']');
    });
  };
  wrap('ins, .inserted', 'eingefügt');
  wrap('del, .deleted', 'gestrichen');
  return $.html();
}

function sectionsText(sections: readonly Section[], diff: boolean): string {
  return sections
    .filter((s) => !SKIPPED_SECTION_TYPES.has(s.type) && s.html)
    .map((s) => {
      const body = htmlToStructuredText(diff ? markDiff(s.html ?? '') : (s.html ?? '')).trim();
      return body ? `## ${s.title}\n\n${body}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

/** Personen mit Namen, Organisationen mit ihrem Namen — für die Facette `antragsteller`. */
export function initiatorNames(initiators: readonly Initiator[]): string[] {
  const names = initiators
    .map((i) => (i.type === 'organization' ? i.organization : i.name)?.trim())
    .filter((n): n is string => Boolean(n));
  return [...new Set(names)];
}

/**
 * Filterwert eines Parteitags. `title_short` allein ist mehrdeutig („LDK"), das
 * Jahr kommt dazu, wenn es nicht schon darin steht. `date_published` ist das
 * Anlagedatum der Konsultation, nicht der Parteitag — für das Jahr reicht es,
 * ein Herbstparteitag wird im Sommer desselben Jahres angelegt.
 */
export function parteitagLabelOf(ref: Pick<ConsultationRef, 'title_short' | 'date_published'>) {
  const short = ref.title_short.replace(/\s+/g, ' ').trim();
  const year = ref.date_published?.slice(0, 4);
  return /\b(19|20)\d{2}\b/.test(short) || !year ? short : `${short} (${year})`;
}

export interface ParteitagContext {
  instance: AntragsgruenInstance;
  consultation: ConsultationRef;
}

export interface ParteitageUnit {
  documentId: string;
  title: string;
  sourceUrl: string;
  text: string;
  /** Text ohne Kopf, für den Sync-Bericht. */
  body: string;
  publishedAt: string | null;
  payload: Record<string, unknown>;
}

export function motionDocumentId(instance: AntragsgruenInstance, motionId: number): string {
  return `ag-${instance.id}-m${motionId}`;
}

export function amendmentDocumentId(instance: AntragsgruenInstance, amendmentId: number): string {
  return `ag-${instance.id}-a${amendmentId}`;
}

/**
 * Was die Übersicht über ein Dokument verrät. Ändert es sich, wird das Dokument
 * neu abgerufen; sonst nur in aktiven Konsultationen (`ParteitageScraper`).
 */
export function motionSignatureOf(link: MotionLink): string {
  return `${link.status_id}|${link.title_with_prefix}`;
}

export function amendmentSignatureOf(link: AmendmentLink): string {
  return `${link.status_id}|${link.prefix ?? ''}`;
}

const isoDate = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function headerOf(
  title: string,
  type: ParteitageContentType,
  ctx: ParteitagContext,
  fields: { agendaItem: string | null; initiators: string; status: string; votum: string | null }
): string {
  const lines = [
    `# ${title}`,
    '',
    `${PARTEITAGE_CONTENT_TYPE_LABELS[type]} · ${ctx.consultation.title} · ${ctx.instance.name}`,
  ];
  if (fields.agendaItem) lines.push(`Tagesordnungspunkt: ${fields.agendaItem}`);
  if (fields.initiators) lines.push(`Antragsteller*innen: ${fields.initiators}`);
  if (fields.status) lines.push(`Status: ${fields.status}`);
  if (fields.votum) lines.push(`Votum der Antragskommission: ${fields.votum}`);
  return lines.join('\n');
}

function basePayload(ctx: ParteitagContext) {
  return {
    source: PARTEITAGE_SOURCE,
    country: 'DE',
    landesverband: ctx.instance.landesverband,
    parteitag: parteitagLabelOf(ctx.consultation),
    parteitag_id: `${ctx.instance.id}/${ctx.consultation.url_path}`,
  };
}

function procedureOf(motionOrAmendment: Motion | Amendment) {
  const procedure = motionOrAmendment.proposed_procedure;
  const votum = plainText(procedure?.status_title) || null;
  const text = procedure?.sections ? sectionsText(procedure.sections, true) : '';
  return { votum, text };
}

export function motionUnitOf(
  motion: Motion,
  link: MotionLink,
  ctx: ParteitagContext
): ParteitageUnit {
  const type = contentTypeOfMotion(motion);
  const status = plainText(motion.status_title);
  const initiators = plainText(motion.initiators_html);
  const procedure = procedureOf(motion);
  const header = headerOf(motion.title_with_prefix, type, ctx, {
    agendaItem: motion.agenda_item,
    initiators,
    status,
    votum: procedure.votum,
  });
  const body = [
    sectionsText(motion.sections, false),
    procedure.text ? `## Verfahrensvorschlag der Antragskommission\n\n${procedure.text}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const text = `${header}\n\n${body}`;
  const documentId = motionDocumentId(ctx.instance, motion.id);
  return {
    documentId,
    title: motion.title_with_prefix,
    sourceUrl: motion.url_html,
    text,
    body,
    publishedAt: isoDate(motion.date_published),
    payload: {
      ...basePayload(ctx),
      document_id: documentId,
      title: motion.title_with_prefix,
      source_url: motion.url_html,
      content_type: type,
      kuerzel: motion.prefix,
      status,
      ...(procedure.votum ? { votum: procedure.votum } : {}),
      antragsteller: initiatorNames(motion.initiators),
      ...(motion.agenda_item ? { tagesordnungspunkt: motion.agenda_item.trim() } : {}),
      published_at: isoDate(motion.date_published),
      list_signature: motionSignatureOf(link),
      content_hash: generateContentHash(text),
    },
  };
}

export function amendmentUnitOf(
  amendment: Amendment,
  link: AmendmentLink,
  ctx: ParteitagContext
): ParteitageUnit {
  const motion = amendment.motion;
  const motionLabel = motion.prefix ? `${motion.prefix}: ${motion.title}` : motion.title;
  const title = `Änderungsantrag ${amendment.prefix ?? amendment.id} zu ${motionLabel}`;
  const status = plainText(amendment.status_title);
  const initiators = plainText(amendment.initiators_html);
  const procedure = procedureOf(amendment);
  const header = headerOf(title, 'aenderungsantrag', ctx, {
    agendaItem: motion.agenda_item,
    initiators,
    status,
    votum: procedure.votum,
  });
  const body = [
    sectionsText(amendment.sections, true),
    procedure.text ? `## Verfahrensvorschlag der Antragskommission\n\n${procedure.text}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const text = `${header}\n\n${body}`;
  const documentId = amendmentDocumentId(ctx.instance, amendment.id);
  return {
    documentId,
    title,
    sourceUrl: amendment.url_html,
    text,
    body,
    publishedAt: isoDate(amendment.date_published),
    payload: {
      ...basePayload(ctx),
      document_id: documentId,
      title,
      source_url: amendment.url_html,
      content_type: 'aenderungsantrag',
      kuerzel: amendment.prefix,
      antrag_id: motionDocumentId(ctx.instance, motion.id),
      antrag_kuerzel: motion.prefix,
      status,
      ...(procedure.votum ? { votum: procedure.votum } : {}),
      antragsteller: initiatorNames(amendment.initiators),
      ...(motion.agenda_item ? { tagesordnungspunkt: motion.agenda_item.trim() } : {}),
      published_at: isoDate(amendment.date_published),
      list_signature: amendmentSignatureOf(link),
      content_hash: generateContentHash(text),
    },
  };
}
