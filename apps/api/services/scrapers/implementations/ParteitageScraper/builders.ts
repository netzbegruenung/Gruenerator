/**
 * Antragsgrün-Antrag bzw. -Änderungsantrag → Dokument in `landesverbaende_documents`,
 * sichtbar im Notebook des Landesverbands und im Notebook „Parteitage".
 *
 * Eine Einheit ist ein Antrag oder ein Änderungsantrag (ÄA). Der Text ist
 * strukturerhaltend (siehe CLAUDE.md, „full_text und chunk_text"): ein kurzer
 * Kopf, dann je Abschnitt eine `##`-Überschrift. Der Kopf bleibt kurz, weil die
 * NLP-Anreicherung nur die ersten 1500 Zeichen liest (`notebookEnrichmentService`).
 *
 * Präzision geht vor Vollständigkeit — das ist politisches Material:
 *   - Ein Datum kommt aus der Quelle oder gar nicht: Beschlussdatum für
 *     Beschlüsse, sonst Veröffentlichungs- bzw. Einreichungsdatum.
 *   - Der Verfahrensvorschlag der Antragskommission ist eine Empfehlung, kein
 *     Abstimmungsergebnis, und heißt im Text auch so.
 *   - Der eingereichte Antrag nennt seinen Beschluss, wenn es einen gibt — sonst
 *     stünde neben dem beschlossenen Text ein abweichender mit Status „Eingereicht".
 */

import * as cheerio from 'cheerio';

import { type AntragsgruenInstance } from '../../../../config/antragsgruenInstances.js';
import { CONTENT_TYPE_LABELS } from '../../../../config/landesverbaendeConfig.js';
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
import { beforeAfterText } from './beforeAfter.js';
import { type NumberedSection, withLineNumbers } from './lineNumbers.js';
import { type PageFacts } from './pageFacts.js';

export const PARTEITAGE_SOURCE = 'parteitage';
export const PARTEITAGE_COLLECTION = 'landesverbaende_documents';

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
 * Überschrift der Abschnitte eines Änderungsantrags. Sie steht im
 * Überschriftenpfad jedes Chunks und damit auch in Passagen ohne Kopf — eine
 * Antwort gab sonst den Text eines ÄA als Position des Landesverbands aus
 * (NRW-Notebook, 16.11.2026: ÄA V-02-005, dessen Satz im Beschluss nicht steht).
 */
const PROPOSAL_HEADING = 'Vorgeschlagene Änderung (kein beschlossener Text)';

/**
 * `diff`: Abschnitte mit Änderungen (ÄA, Verfahrensvorschlag) als „Bisher/Neu"
 * (`beforeAfter.ts`). `numbered`: die Zeilenabschnitte der Antragsseite; trägt
 * einer denselben Text, bekommt jeder Absatz seine Zeilenmarke (`lineNumbers.ts`).
 */
function sectionsText(
  sections: readonly Section[],
  opts: { diff: boolean; numbered?: readonly NumberedSection[]; headingPrefix?: string }
): string {
  const { diff, numbered = [], headingPrefix = null } = opts;
  return sections
    .filter((s) => !SKIPPED_SECTION_TYPES.has(s.type) && s.html)
    .map((s) => {
      const html = s.html ?? '';
      const body = (
        diff
          ? beforeAfterText(html)
          : (withLineNumbers(html, numbered) ?? htmlToStructuredText(html))
      ).trim();
      const heading = headingPrefix ? `${headingPrefix}: ${s.title}` : s.title;
      return body ? `## ${heading}\n\n${body}` : '';
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

/** ISO-Zeitstempel der API → `YYYY-MM-DD` in Europe/Berlin; die Seite kennt nur Tage. */
const dayOf = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
};

const germanDay = (iso: string): string => iso.split('-').reverse().join('.');

/** Für das neueste Fassung eines eingereichten Antrags — aus der Übersicht. */
export interface NewestVersion {
  documentId: string;
  /** „Beschluss V-07: …" bzw. „Antrag V-07: …" */
  title: string;
  isBeschluss: boolean;
}

const PROCEDURE_LINE =
  'Verfahrensvorschlag der Antragskommission (Empfehlung, kein Abstimmungsergebnis)';

function headerOf(
  title: string,
  type: ParteitageContentType,
  ctx: ParteitagContext,
  lines: string[]
) {
  return [
    `# ${title}`,
    '',
    `${PARTEITAGE_CONTENT_TYPE_LABELS[type]} · ${ctx.consultation.title} · ${ctx.instance.name}`,
    ...lines,
  ].join('\n');
}

function basePayload(ctx: ParteitagContext, type: ParteitageContentType) {
  return {
    source: PARTEITAGE_SOURCE,
    source_id: ctx.instance.sourceId,
    source_name: `Antragsgrün ${ctx.instance.name}`,
    source_type: 'landesverband',
    landesverband: ctx.instance.landesverband,
    country: 'DE',
    content_type: type,
    content_type_label: CONTENT_TYPE_LABELS[type],
    parteitag: parteitagLabelOf(ctx.consultation),
    parteitag_id: `${ctx.instance.id}/${ctx.consultation.url_path}`,
  };
}

function procedureOf(motionOrAmendment: Motion | Amendment) {
  const procedure = motionOrAmendment.proposed_procedure;
  const votum = plainText(procedure?.status_title) || null;
  const text = procedure?.sections ? sectionsText(procedure.sections, { diff: true }) : '';
  return { votum, text };
}

export function statusOf(statusTitle: string, statusId: number): string {
  const status = plainText(statusTitle);
  // Antragsgrün zeigt einen vorläufigen Beschluss je nach Seite nur als „Beschluss".
  return statusId === 25 && !/vorläufig/i.test(status) ? `${status} (vorläufig)` : status;
}

export function motionUnitOf(
  motion: Motion,
  link: MotionLink,
  ctx: ParteitagContext,
  facts: PageFacts,
  newest: NewestVersion | null
): ParteitageUnit {
  const type = contentTypeOfMotion(motion);
  const status = statusOf(motion.status_title, motion.status_id);
  const procedure = procedureOf(motion);
  // Antrag und Beschluss tragen in Antragsgrün denselben Titel; ohne die Art
  // im Titel sind sie in der Quellenliste nicht zu unterscheiden, und eine
  // Antwort schrieb dem Beschluss zu, was im Antrag stand (Live-Test 15.11.2026).
  const title = `${PARTEITAGE_CONTENT_TYPE_LABELS[type]} ${motion.title_with_prefix}`;
  const eingereichtAm = dayOf(motion.date_published) ?? facts.eingereichtAm;
  // Ohne „Beschlossen am" das Datum einer eintägigen Veranstaltung — und so
  // gekennzeichnet (Landesparteirat Schwerte 2026, V-01).
  const beschlossenAm =
    type === 'beschluss' ? (facts.beschlossenAm ?? facts.veranstaltungAm) : null;
  const beschlussDatumQuelle =
    beschlossenAm === null ? null : facts.beschlossenAm ? 'beschlossen_am' : 'veranstaltung';
  const lines: string[] = [];
  if (motion.agenda_item) lines.push(`Tagesordnungspunkt: ${motion.agenda_item.trim()}`);
  const initiators = plainText(motion.initiators_html);
  if (initiators) lines.push(`Antragsteller*innen: ${initiators}`);
  lines.push(`Status: ${status}`);
  if (beschlossenAm) {
    const durch = facts.beschlussDurch ? ` durch ${facts.beschlussDurch}` : '';
    const quelle = beschlussDatumQuelle === 'veranstaltung' ? ' (Tag der Veranstaltung)' : '';
    lines.push(`Beschlossen am ${germanDay(beschlossenAm)}${quelle}${durch}`);
  } else if (eingereichtAm) {
    lines.push(`Eingereicht am ${germanDay(eingereichtAm)}`);
  }
  if (newest) {
    lines.push(
      newest.isBeschluss
        ? `Fassung: eingereichter Antrag. Beschlossen wurde die Fassung „${newest.title}" — sie kann von diesem Text abweichen.`
        : `Fassung: eingereichter Antrag. Es gibt eine neuere Fassung: „${newest.title}".`
    );
  }
  if (procedure.votum) lines.push(`${PROCEDURE_LINE}: ${procedure.votum}`);
  const header = headerOf(title, type, ctx, lines);
  const body = [
    sectionsText(motion.sections, { diff: false, numbered: facts.numbered }),
    procedure.text ? `## ${PROCEDURE_LINE}\n\n${procedure.text}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const text = `${header}\n\n${body}`;
  const documentId = motionDocumentId(ctx.instance, motion.id);
  return {
    documentId,
    title,
    sourceUrl: motion.url_html,
    text,
    body,
    publishedAt: beschlossenAm ?? eingereichtAm,
    payload: {
      ...basePayload(ctx, type),
      document_id: documentId,
      title,
      antrag_titel: motion.title,
      source_url: motion.url_html,
      kuerzel: motion.prefix,
      status,
      ...(procedure.votum ? { votum: procedure.votum } : {}),
      antragsteller: initiatorNames(motion.initiators),
      ...(motion.agenda_item ? { tagesordnungspunkt: motion.agenda_item.trim() } : {}),
      ...(eingereichtAm ? { eingereicht_am: eingereichtAm } : {}),
      ...(beschlossenAm
        ? { beschlossen_am: beschlossenAm, beschlussdatum_quelle: beschlussDatumQuelle }
        : {}),
      ...(type === 'beschluss' && facts.beschlussDurch
        ? { beschluss_durch: facts.beschlussDurch }
        : {}),
      ...(newest ? { neueste_fassung_id: newest.documentId } : {}),
      published_at: beschlossenAm ?? eingereichtAm,
      list_signature: motionSignatureOf(link),
      content_hash: generateContentHash(text),
    },
  };
}

export function amendmentUnitOf(
  amendment: Amendment,
  link: AmendmentLink,
  ctx: ParteitagContext,
  facts: PageFacts | null,
  beschluss: NewestVersion | null
): ParteitageUnit {
  const motion = amendment.motion;
  const motionLabel = motion.prefix ? `${motion.prefix}: ${motion.title}` : motion.title;
  const title = `Änderungsantrag ${amendment.prefix ?? amendment.id} zu ${motionLabel}`;
  const status = statusOf(amendment.status_title, amendment.status_id);
  const procedure = procedureOf(amendment);
  const eingereichtAm = dayOf(amendment.date_published) ?? facts?.eingereichtAm ?? null;
  const lines: string[] = [];
  if (motion.agenda_item) lines.push(`Tagesordnungspunkt: ${motion.agenda_item.trim()}`);
  const initiators = plainText(amendment.initiators_html);
  if (initiators) lines.push(`Antragsteller*innen: ${initiators}`);
  lines.push(`Status: ${status}`);
  if (eingereichtAm) lines.push(`Eingereicht am ${germanDay(eingereichtAm)}`);
  if (procedure.votum) lines.push(`${PROCEDURE_LINE}: ${procedure.votum}`);
  lines.push(
    beschluss?.isBeschluss
      ? `Hinweis: Änderungsvorschlag, kein beschlossener Text. Maßgeblich ist „${beschluss.title}".`
      : 'Hinweis: Änderungsvorschlag, kein beschlossener Text.'
  );
  const header = headerOf(title, 'aenderungsantrag', ctx, lines);
  const body = [
    sectionsText(amendment.sections, { diff: true, headingPrefix: PROPOSAL_HEADING }),
    procedure.text ? `## ${PROCEDURE_LINE}\n\n${procedure.text}` : '',
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
    publishedAt: eingereichtAm,
    payload: {
      ...basePayload(ctx, 'aenderungsantrag'),
      document_id: documentId,
      title,
      source_url: amendment.url_html,
      kuerzel: amendment.prefix,
      antrag_id: motionDocumentId(ctx.instance, motion.id),
      antrag_kuerzel: motion.prefix,
      ...(beschluss?.isBeschluss ? { beschluss_id: beschluss.documentId } : {}),
      status,
      ...(procedure.votum ? { votum: procedure.votum } : {}),
      antragsteller: initiatorNames(amendment.initiators),
      ...(motion.agenda_item ? { tagesordnungspunkt: motion.agenda_item.trim() } : {}),
      ...(eingereichtAm ? { eingereicht_am: eingereichtAm } : {}),
      published_at: eingereichtAm,
      list_signature: amendmentSignatureOf(link),
      content_hash: generateContentHash(text),
    },
  };
}
