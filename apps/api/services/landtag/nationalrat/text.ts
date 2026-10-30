/**
 * Stufe „fetch" für den Nationalrat: Kandidat → Volltext, nur von
 * www.parlament.gv.at. Gegenstände tragen ihre Dokumente auf der Detailseite
 * (Regierungsvorlage: Gesetzestext, Erläuterungen, Vorblatt …); gelesen wird
 * die HTML-Fassung, wo es sie gibt, sonst das PDF — nie der Scan des
 * Originals (`imfname_`). Sitzungsprotokolle sind eine HTML-Datei je Sitzung
 * (≈ 400 k Zeichen, eine Marke je Rede, keine Seitenzahlen); bis es die gibt,
 * eine Datei je Rede.
 */
import { type BundestagCandidate } from '@gruenerator/contracts';

import { createLogger } from '../../../utils/logger.js';
import { createLimiter } from '../../bundestag/qa/budget.js';
import {
  type CachedText,
  type FetchedDoc,
  type TextCache,
  fetchBytes,
  readCache,
  writeCache,
} from '../../bundestag/qa/fetchTexts.js';
import { extractPdfText } from '../../pdf/pdfText.js';
import { htmlToStructuredText } from '../../scrapers/utils/htmlCleaner.js';

import { gpRoman, parseNationalratRef, protokollHtmlLink } from './documents.js';
import { type NationalratApi, PARLAMENT_BASE, PARLAMENT_HOST } from './filterApi.js';

const log = createLogger('NationalratText');

/** So viele Dokumente einer Detailseite werden gelesen (Gesetzestext, Erläuterungen …). */
const MAX_DOCS_PER_ITEM = 4;

/** So viele Reden einer Sitzung werden gleichzeitig geladen. */
const REDEN_CONCURRENCY = 6;

// v2: vorher stand für jede Sitzung ohne Gesamtprotokoll ein gecachtes „fehlt“.
// v3: v2 trug für dieselben Sitzungen nur das Inhaltsverzeichnis, nicht die Reden.
const cacheKey = (c: BundestagCandidate) => `lt:nr:text:v3:${c.dipId}`;

async function htmlText(link: string, signal: AbortSignal): Promise<string> {
  const html = new TextDecoder().decode(
    await fetchBytes(`${PARLAMENT_BASE}${link}`, signal, PARLAMENT_HOST)
  );
  // `<title>` und Stile stünden sonst als erster Absatz im Text.
  return htmlToStructuredText(html.replace(/<head[\s\S]*?<\/head>/i, '')).trim();
}

async function gegenstandText(
  c: BundestagCandidate,
  api: NationalratApi,
  signal: AbortSignal
): Promise<CachedText> {
  const links = await api.dokumente(c.dipId, signal);
  // Je Gruppe die HTML-Fassung, sonst das elektronische PDF; der Scan (`imfname_`) ist kein Text.
  const byGruppe = new Map<string, { link: string; html: boolean }>();
  for (const l of links) {
    const html = l.type === 'HTML';
    if (!html && (l.type !== 'PDF' || /\/imfname_/.test(l.link))) continue;
    const have = byGruppe.get(l.gruppe);
    if (!have || (html && !have.html)) byGruppe.set(l.gruppe, { link: l.link, html });
  }
  const parts: string[] = [];
  let pdf = false;
  for (const [gruppe, l] of [...byGruppe].slice(0, MAX_DOCS_PER_ITEM)) {
    const text = l.html
      ? await htmlText(l.link, signal)
      : (
          await extractPdfText(
            await fetchBytes(`${PARLAMENT_BASE}${l.link}`, signal, PARLAMENT_HOST)
          )
        ).trim();
    if (!text) continue;
    pdf ||= !l.html;
    parts.push(gruppe ? `## ${gruppe}\n\n${text}` : text);
  }
  const text = parts.join('\n\n');
  return text ? { text, textSource: pdf ? 'pdf' : 'html' } : { text: '', textSource: 'missing' };
}

async function protokollText(
  c: BundestagCandidate,
  api: NationalratApi,
  signal: AbortSignal
): Promise<CachedText> {
  const gp = parseNationalratRef(c.ref)?.gp;
  if (gp == null) return { text: '', textSource: 'missing' };
  const row = (await api.protokolle(gpRoman(gp))).find((r) => r.uri === c.dipId);
  if (!row) return { text: '', textSource: 'missing' };
  const link = protokollHtmlLink(row);
  if (link) {
    const text = await htmlText(link, signal);
    return text ? { text, textSource: 'html' } : { text: '', textSource: 'missing' };
  }
  // Das Gesamtprotokoll kommt erst Monate nach der Sitzung (am 30.10.2026 fehlte es ab
  // der 55. Sitzung überall). Bis dahin liegt jede Rede als eigene Datei auf der
  // Detailseite (Sitzung 103: 95 Reden, je ≈ 6 k Zeichen); zusammen ergeben sie den
  // Text, in dem `fokus` dann wie im Gesamtprotokoll sucht. Fällt eine Rede aus, scheitert
  // der Abruf ganz: eine lückenhafte Sitzung stünde sonst eine Woche im Cache.
  const reden = await api.reden(c.dipId, signal);
  if (reden.length > 0) {
    const limit = createLimiter(REDEN_CONCURRENCY);
    const texte = await Promise.all(
      reden.map((r) =>
        limit(async () => {
          const text = await htmlText(r.link, signal);
          return text ? `## ${r.titel}\n\n${text}` : '';
        })
      )
    );
    const text = texte.filter(Boolean).join('\n\n');
    if (text) {
      return {
        text: `## Vorläufiges Protokoll (Reden noch nicht autorisiert)\n\nDas Gesamtprotokoll liegt noch nicht vor; jede Rede steht hier im vorläufigen Wortlaut.\n\n${text}`,
        textSource: 'html',
      };
    }
  }
  // Ohne Debatte (z. B. eine reine Wahl- oder Festsitzung) bleibt das Inhaltsverzeichnis
  // des vorläufigen Protokolls: Tagesordnung und wer wann gesprochen hat.
  const verzeichnis = (await api.dokumente(c.dipId, signal)).find(
    (l) => l.type === 'HTML' && l.gruppe.startsWith('Inhaltsverzeichnis')
  );
  const text = verzeichnis ? await htmlText(verzeichnis.link, signal) : '';
  return text
    ? {
        text: `## Vorläufiges Protokoll (nur Inhaltsverzeichnis)\n\nDer Wortlaut der Reden liegt erst mit dem Gesamtprotokoll vor; dieses Verzeichnis nennt Tagesordnung und Redner*innen.\n\n${text}`,
        textSource: 'html',
      }
    : { text: '', textSource: 'missing' };
}

async function fetchOne(
  c: BundestagCandidate,
  api: NationalratApi,
  redis: TextCache | null,
  signal: AbortSignal
): Promise<CachedText> {
  const hit = await readCache(redis, cacheKey(c));
  if (hit) return hit;
  try {
    const value =
      parseNationalratRef(c.ref)?.ityp === 'NRSITZ'
        ? await protokollText(c, api, signal)
        : await gegenstandText(c, api, signal);
    await writeCache(redis, cacheKey(c), value);
    return value;
  } catch (error: unknown) {
    log.warn(`Text nicht lesbar (${c.ref}): ${String(error)}`);
    return { text: '', textSource: 'missing' };
  }
}

/** Ergebnis in der Reihenfolge der Kandidaten; was nicht zu holen war, trägt `'missing'`. */
export async function fetchNationalratTexts(
  candidates: readonly BundestagCandidate[],
  deps: { redis: TextCache | null; signal: AbortSignal },
  api: NationalratApi
): Promise<FetchedDoc[]> {
  return Promise.all(
    candidates.map(async (c) => ({ ...c, ...(await fetchOne(c, api, deps.redis, deps.signal)) }))
  );
}
