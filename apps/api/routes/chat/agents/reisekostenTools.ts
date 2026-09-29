/**
 * Reisekostenabrechnung im Chat: rechnen, prüfen und auf Wunsch das PDF bauen.
 *
 * Alle Beträge kommen aus dem deterministischen Kern
 * (`@gruenerator/shared/reisekosten`), denselben Funktionen, die der Wizard
 * nutzt. Das Modell liefert nur die Angaben; eine Summe, die es selbst
 * ausrechnet, landet nirgends.
 *
 * Die Eingabe ist bewusst flacher als `ReisekostenState`: jedes Feld ist
 * optional, und die Pflicht-Booleans des Zustands (`belegVorhanden`,
 * `routenplanerVorhanden`) stehen auf `false`, bis das Modell sie belegt. Was
 * fehlt, meldet `validateReisekosten` als Befund zurück — das ist die Rückfrage-
 * liste für den nächsten Turn.
 *
 * Das PDF läuft über die Rechenkarte (`computedResult` + `compute`-Event), wie
 * bei `fill_pdf_form`.
 */
import {
  type Finding,
  type ReisekostenState,
  fahrzeugTypSchema,
  uebernachtungModusSchema,
} from '@gruenerator/contracts';
import {
  computeReisekosten,
  emptyReisekostenState,
  validateReisekosten,
} from '@gruenerator/shared/reisekosten';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../../utils/logger.js';
import { buildReisekostenPdf } from '../../reisekosten/pdfBuilder.js';
import { persistComputeAssets } from '../services/computeAssetStorage.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const log = createLogger('ReisekostenTool');

const EUR = (n: number) =>
  `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export interface ReisekostenToolCtx {
  state: ChatGraphState;
  sse: SSEWriter;
}

const betrag = z.number().describe('Betrag in Euro');
const beleg = z.boolean().optional().describe('true = Originalbeleg liegt vor');

export const reisekostenToolInputSchema = z.object({
  stammdaten: z
    .object({
      name: z.string(),
      funktion: z.string(),
      strasse: z.string(),
      hausnr: z.string(),
      plz: z.string(),
      ort: z.string(),
      email: z.string(),
      telefon: z.string(),
      iban: z
        .string()
        .describe('Nur wenn die Person sie selbst nennt; sonst weglassen (handschriftlich)'),
      bic: z.string(),
      wahlBeschlussVom: z.string().describe('Formularfeld „Wahl/Beschluss vom“'),
    })
    .partial()
    .optional(),
  reise: z
    .object({
      anlass: z.string(),
      ziel: z.string().describe('Genaue Anschrift'),
      reisebeginn: z.string().describe('Verlassen der Wohnung, YYYY-MM-DDTHH:mm'),
      rueckkehr: z.string().describe('Erreichen der Wohnung, YYYY-MM-DDTHH:mm'),
    })
    .partial()
    .optional(),
  bahn: z.object({ betrag, belegVorhanden: beleg }).optional(),
  oepnv: z.object({ betrag, belegVorhanden: beleg }).optional(),
  kfz: z
    .object({
      km: z.number().describe('Kürzeste Strecke laut Routenplaner, Hin + Rück'),
      fahrzeug: fahrzeugTypSchema.optional(),
      routenplanerVorhanden: z.boolean().optional(),
      vorstandsbeschluss: z.boolean().optional().describe('Nötig für mehr als 500 km'),
    })
    .optional(),
  miete: z
    .object({ betrag, belegVorhanden: beleg, vorstandsbeschluss: z.boolean().optional() })
    .optional(),
  taxi: z.object({ betrag, begruendung: z.string().optional(), belegVorhanden: beleg }).optional(),
  sonstiges: z.object({ betrag, beschreibung: z.string().optional() }).optional(),
  verpflegungAbzuege: z
    .array(
      z.object({
        datum: z.string().describe('YYYY-MM-DD'),
        fruehstueck: z.boolean().optional(),
        mittagessen: z.boolean().optional(),
        abendessen: z.boolean().optional(),
      })
    )
    .optional()
    .describe('Gestellte, nicht selbst bezahlte Mahlzeiten je Tag'),
  uebernachtung: z
    .object({
      modus: uebernachtungModusSchema.describe(
        'lv_bezahlt = Verband zahlt direkt, beleg = Hotelrechnung, pauschal = 20 €/Nacht privat'
      ),
      betrag: z.number().optional(),
      naechte: z.number().optional(),
    })
    .optional(),
  spende: z.number().optional().describe('Freiwillige Spende, wird von der Auszahlung abgezogen'),
  pdfErstellen: z.boolean().describe('true erst, wenn die Person die Aufstellung bestätigt hat'),
});

export type ReisekostenToolInput = z.infer<typeof reisekostenToolInputSchema>;

/** Drops keys the model sent as undefined so a spread keeps the blank default. */
function definedOnly<T extends object>(
  o: T | undefined
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

export function toReisekostenState(input: ReisekostenToolInput): ReisekostenState {
  const base = emptyReisekostenState();
  return {
    ...base,
    stammdaten: { ...base.stammdaten, ...definedOnly(input.stammdaten) },
    reise: { ...base.reise, ...definedOnly(input.reise) },
    fahrt: {
      bahn: input.bahn
        ? { betrag: input.bahn.betrag, belegVorhanden: input.bahn.belegVorhanden === true }
        : null,
      oepnv: input.oepnv
        ? { betrag: input.oepnv.betrag, belegVorhanden: input.oepnv.belegVorhanden === true }
        : null,
      kfz: input.kfz
        ? {
            km: input.kfz.km,
            fahrzeug: input.kfz.fahrzeug ?? 'pkw',
            routenplanerVorhanden: input.kfz.routenplanerVorhanden === true,
            dbFlexpreis: null,
            vorstandsbeschluss: input.kfz.vorstandsbeschluss === true,
          }
        : null,
      miete: input.miete
        ? {
            betrag: input.miete.betrag,
            dbFlexpreis: null,
            belegVorhanden: input.miete.belegVorhanden === true,
            vorstandsbeschluss: input.miete.vorstandsbeschluss === true,
          }
        : null,
      taxi: input.taxi
        ? {
            betrag: input.taxi.betrag,
            begruendung: input.taxi.begruendung ?? '',
            belegVorhanden: input.taxi.belegVorhanden === true,
          }
        : null,
      sonstiges: input.sonstiges
        ? { betrag: input.sonstiges.betrag, beschreibung: input.sonstiges.beschreibung ?? '' }
        : null,
    },
    verpflegungAbzuege: (input.verpflegungAbzuege ?? []).map((a) => ({
      datum: a.datum,
      fruehstueck: a.fruehstueck === true,
      mittagessen: a.mittagessen === true,
      abendessen: a.abendessen === true,
    })),
    uebernachtung: input.uebernachtung
      ? {
          modus: input.uebernachtung.modus,
          betrag: input.uebernachtung.betrag ?? null,
          naechte: input.uebernachtung.naechte ?? null,
        }
      : null,
    spende: input.spende ?? 0,
  };
}

/**
 * Eine fehlende IBAN ist im Chat kein Fehler: wer sie nicht in den Verlauf
 * schreiben will, trägt sie auf dem Ausdruck von Hand ein.
 */
function chatFindings(state: ReisekostenState, now: Date): Finding[] {
  const findings = validateReisekosten(state, now).filter((f) => f.field !== 'stammdaten.iban');
  if (!state.stammdaten.iban.trim()) {
    findings.push({
      level: 'info',
      field: 'stammdaten.iban',
      message: 'Keine IBAN angegeben – bitte auf dem Ausdruck handschriftlich eintragen.',
    });
  }
  return findings;
}

export function makeReisekostenTool(ctx: ReisekostenToolCtx): Tool {
  return tool({
    description:
      'Reisekostenabrechnung nach den Sätzen des Landesverbands NRW (Formular ab 1.7.2025) ' +
      'berechnen und prüfen. Übergib alle bekannten Angaben aus Gespräch und Belegen; fehlende ' +
      'Pflichtangaben kommen als Befund zurück. Mit pdfErstellen=true entsteht das PDF zum Download.',
    inputSchema: reisekostenToolInputSchema,
    execute: async (input) => {
      const state = toReisekostenState(input);
      const findings = chatFindings(state, new Date());
      const c = computeReisekosten(state);
      const fehler = findings.filter((f) => f.level === 'error').map((f) => f.message);
      const hinweise = findings.filter((f) => f.level !== 'error').map((f) => f.message);

      const aufstellung = {
        fahrtkosten: c.fahrtkosten,
        verpflegung: c.verpflegung,
        uebernachtung: c.uebernachtung.summe,
        gesamt: c.gesamt,
        spende: c.spende,
        auszahlung: c.auszahlung,
      };

      if (!input.pdfErstellen) {
        return {
          ok: true,
          aufstellung,
          ...(fehler.length > 0 && { fehler }),
          ...(hinweise.length > 0 && { hinweise }),
          note:
            fehler.length > 0
              ? 'Frag die fehlenden Angaben aus "fehler" gebündelt in EINER Rückfrage ab.'
              : 'Zeig die Aufstellung und lass sie bestätigen, bevor du mit pdfErstellen=true aufrufst.',
        };
      }

      if (fehler.length > 0) {
        return {
          error: 'Das PDF wurde NICHT erstellt – die Abrechnung ist noch unvollständig.',
          fehler,
          ...(hinweise.length > 0 && { hinweise }),
        };
      }

      const userId = ctx.state.agentConfig?.userId ?? null;
      if (!userId) return { error: 'Keine Sitzung — das PDF kann nicht gespeichert werden.' };

      let bytes: Buffer;
      try {
        bytes = await buildReisekostenPdf(state);
      } catch (err) {
        log.error(`[ReisekostenTool] PDF failed: ${err instanceof Error ? err.message : err}`);
        return { error: 'Das PDF konnte nicht erstellt werden.' };
      }

      const fileName = `reisekosten-${state.reise.rueckkehr.slice(0, 10) || 'abrechnung'}.pdf`;
      const payload = await persistComputeAssets(userId, {
        operation: 'Reisekostenabrechnung',
        entries: [
          { label: 'Fahrtkosten', value: EUR(c.fahrtkosten.summe) },
          { label: 'Verpflegung', value: EUR(c.verpflegung.summe) },
          { label: 'Übernachtung', value: EUR(c.uebernachtung.summe) },
          { label: 'Gesamt', value: EUR(c.gesamt) },
          { label: 'Auszahlung', value: EUR(c.auszahlung) },
        ],
        summary: `Reisekostenabrechnung ${state.reise.anlass}: ${EUR(c.auszahlung)} Auszahlung.`,
        files: [{ name: fileName, b64: bytes.toString('base64') }],
      });

      ctx.state.computedResult = payload;
      ctx.state.computedResultFresh = true;
      ctx.sse.send('compute', { compute: payload });

      log.info(`[ReisekostenTool] PDF built, gesamt=${c.gesamt}`);
      return {
        ok: true,
        fileName,
        aufstellung,
        ...(hinweise.length > 0 && { hinweise }),
        note:
          `"${fileName}" steht bereits zum Download bereit — erwähne das kurz. Gib KEINEN Link aus. ` +
          'Erinnere daran: ausdrucken, unterschreiben, Originalbelege beifügen.',
      };
    },
  });
}
